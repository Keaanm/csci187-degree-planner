// Darren Hu
// Starts the server on a free port with an in-memory database and calls every route in API.md.
#include <filesystem>
#include <iostream>
#include <memory>
#include <thread>

#include <sqlite3.h>

#include "Auth.h"
#include "Database.h"
#include "Routes.h"

using nlohmann::json;

static int failures = 0;

#define CHECK(cond)                                                          \
  do {                                                                       \
    if (!(cond)) {                                                           \
      std::cerr << "FAILED line " << __LINE__ << ": " #cond << std::endl;     \
      ++failures;                                                            \
    }                                                                        \
  } while (0)

// The student's first plan (the "Main plan" sign-up made), for tests that use Database directly.
static int firstPlanId(Database& db, int studentId) {
  json plans = db.plans(studentId);
  return plans.empty() ? 0 : plans[0]["planId"].get<int>();
}
static std::optional<json> firstPlan(Database& db, int studentId) {
  return db.planById(studentId, firstPlanId(db, studentId));
}

int main() {
  auth::init();
  Database db(":memory:");
  db.seed(DEFAULT_DATA_DIR);

  httplib::Server server;
  registerRoutes(server, db);
  int port = server.bind_to_any_port("127.0.0.1");
  std::thread thread([&] { server.listen_after_bind(); });
  server.wait_until_ready();

  httplib::Client client("127.0.0.1", port);  // never logged in
  auto status = [](const httplib::Result& res) { return res ? res->status : -1; };
  // A failed request or bad JSON gives an empty object, so the CHECKs fail instead of crashing.
  auto body = [](const httplib::Result& res) {
    json parsed = res ? json::parse(res->body, nullptr, false) : json::object();
    return parsed.is_discarded() ? json::object() : parsed;
  };
  // "session=abc; HttpOnly; ..." -> "session=abc", ready to send back as a Cookie header.
  auto sessionCookie = [](const httplib::Result& res) {
    std::string setCookie = res ? res->get_header_value("Set-Cookie") : "";
    return setCookie.substr(0, setCookie.find(';'));
  };
  auto post = [](httplib::Client& c, const std::string& path, const json& body) {
    return c.Post(path, body.dump(), "application/json");
  };
  // Signs up on its own client, which then sends the session cookie with every request,
  // like a browser would.
  auto newStudent = [&](const std::string& email) {
    auto c = std::make_unique<httplib::Client>("127.0.0.1", port);
    auto res = post(*c, "/api/signup", {{"email", email}, {"password", "correct horse"}, {"startYear", 2024}});
    CHECK(status(res) == 201);
    c->set_default_headers({{"Cookie", sessionCookie(res)}});
    return c;
  };

  // GET /api/courses
  {
    auto res = client.Get("/api/courses");
    CHECK(status(res) == 200);
    json courses = body(res);
    CHECK(courses.size() == 51);
    json csci10, csci61, csci62;
    for (auto& c : courses) {
      if (c["code"] == "CSCI 10") csci10 = c;
      if (c["code"] == "CSCI 61") csci61 = c;
      if (c["code"] == "CSCI 62") csci62 = c;
    }
    CHECK(csci10["prerequisites"] == json::array());
    CHECK(csci61["units"] == 4);
    CHECK(csci61["prerequisites"] == json::parse(R"([["CSCI 60"]])"));
    CHECK(csci61["title"] == "Data Structures");
    // Every group is needed; any one course in a group meets it.
    CHECK(csci62["prerequisites"] == json::parse(R"([["CSCI 60"], ["CSCI 61", "CSEN 79"]])"));
  }

  // GET /api/requirements: count defaults to every listed course.
  {
    auto res = client.Get("/api/requirements");
    CHECK(status(res) == 200);
    json reqs = body(res);
    CHECK(reqs.size() == 33);
    CHECK(reqs[0]["requirementId"] == 1);
    CHECK(reqs[0]["courses"] == json::parse(R"(["CSCI 10", "CSCI 60", "CSCI 61", "CSCI 62"])"));
    CHECK(reqs[0]["count"] == 4);
    CHECK(reqs[2]["count"] == 1);
    CHECK(reqs[6]["count"] == 2);
    // Each requirement names its program: the major (1), Software (2), ..., the Core (6).
    CHECK(reqs[0]["programId"] == 1);
    CHECK(reqs[6]["programId"] == 2);
    CHECK(reqs[0]["units"].is_null());
    // A Core area lists no courses; it's met by one course from outside this catalog.
    json core = reqs[13];
    CHECK(core["description"] == "Core: Critical Thinking & Writing 1");
    CHECK(core["programId"] == 6);
    CHECK(core["courses"] == json::array());
    CHECK(core["count"] == 1);
    // A Pathway is four courses and at least 16 units.
    CHECK(reqs.back()["count"] == 4);
    CHECK(reqs.back()["units"] == 16);
  }

  // ---- Accounts ----

  // Sign up: creates the account, logs it in and returns the email and start year.
  {
    auto res = post(client, "/api/signup",
                    {{"email", "  Ana@SCU.edu "}, {"password", "correct horse"}, {"startYear", 2025}});
    CHECK(status(res) == 201);
    CHECK(body(res) == json::parse(R"({"email": "ana@scu.edu", "startYear": 2025})"));
    std::string setCookie = res ? res->get_header_value("Set-Cookie") : "";
    CHECK(setCookie.rfind("session=", 0) == 0);
    CHECK(setCookie.find("HttpOnly") != std::string::npos);
    CHECK(setCookie.find("SameSite=Lax") != std::string::npos);
    CHECK(sessionCookie(res).size() == std::string("session=").size() + 64);

    // The cookie works for /api/me.
    auto me = client.Get("/api/me", {{"Cookie", sessionCookie(res)}});
    CHECK(status(me) == 200);
    CHECK(body(me)["email"] == "ana@scu.edu");

    // The password is stored hashed, never as plain text.
    auto login = db.findStudentByEmail("ana@scu.edu");
    CHECK(login && login->passwordHash != "correct horse");
    CHECK(login && login->passwordHash.rfind("$argon2id$", 0) == 0);
  }

  // The same email can't sign up twice, whatever its case.
  {
    auto res = post(client, "/api/signup",
                    {{"email", "ANA@scu.edu"}, {"password", "another password"}, {"startYear", 2025}});
    CHECK(status(res) == 409);
    CHECK(res && res->get_header_value("Set-Cookie").empty());
  }

  // Bad sign-ups are 400s and don't create an account.
  {
    const char* bad[] = {
        "not json",
        R"([])",
        R"({"password": "correct horse", "startYear": 2025})",
        R"({"email": "noat.example.com", "password": "correct horse", "startYear": 2025})",
        R"({"email": "nodot@example", "password": "correct horse", "startYear": 2025})",
        R"({"email": "short@example.com", "password": "1234567", "startYear": 2025})",
        R"({"email": "noyear@example.com", "password": "correct horse"})",
        R"({"email": "textyear@example.com", "password": "correct horse", "startYear": "2025"})",
        R"({"email": "oldyear@example.com", "password": "correct horse", "startYear": 1999})",
        R"({"email": "a@.", "password": "correct horse", "startYear": 2025})",
        R"({"email": "a@b.c;x", "password": "correct horse", "startYear": 2025})",
        R"({"email": "a,b@c.d", "password": "correct horse", "startYear": 2025})",
        R"({"email": "a@@b.cd", "password": "correct horse", "startYear": 2025})",
        R"({"email": "a@b..cd", "password": "correct horse", "startYear": 2025})",
        R"({"email": "a@b.cd.", "password": "correct horse", "startYear": 2025})",
        R"({"email": "nul@example.com\u0000", "password": "correct horse", "startYear": 2025})",
    };
    for (const char* bad_body : bad) {
      auto res = client.Post("/api/signup", bad_body, "application/json");
      if (status(res) != 400) std::cerr << "Expected 400 for sign-up: " << bad_body << "\n";
      CHECK(status(res) == 400);
    }
    CHECK(!db.findStudentByEmail("short@example.com"));

    // Too long: an email over 254 characters, or a password over 256.
    std::string longEmail = std::string(250, 'a') + "@b.cd";
    CHECK(status(post(client, "/api/signup", {{"email", longEmail}, {"password", "correct horse"}, {"startYear", 2025}})) == 400);
    CHECK(status(post(client, "/api/signup",
                      {{"email", "longpw@example.com"}, {"password", std::string(257, 'x')}, {"startYear", 2025}})) == 400);
    CHECK(!db.findStudentByEmail("longpw@example.com"));
  }

  // Login and sign-up only accept JSON, so a form on another site can't log a visitor in.
  {
    auto signup = client.Post("/api/signup", R"({"email": "form@example.com", "password": "correct horse", "startYear": 2025})",
                              "text/plain");
    CHECK(status(signup) == 400);
    CHECK(body(signup)["error"] == "Content-Type must be application/json");
    CHECK(!db.findStudentByEmail("form@example.com"));

    auto login = client.Post("/api/login", "email=ana%40scu.edu&password=correct+horse", "application/x-www-form-urlencoded");
    CHECK(status(login) == 400);
    CHECK(login && login->get_header_value("Set-Cookie").empty());
    auto plainLogin = client.Post("/api/login", R"({"email": "ana@scu.edu", "password": "correct horse"})", "text/plain");
    CHECK(status(plainLogin) == 400);
  }

  // Login: right password works, a wrong password or unknown email is a 401 with the same message.
  {
    auto res = post(client, "/api/login", {{"email", "ana@scu.edu"}, {"password", "correct horse"}});
    CHECK(status(res) == 200);
    CHECK(body(res) == json::parse(R"({"email": "ana@scu.edu", "startYear": 2025})"));
    CHECK(status(client.Get("/api/me", {{"Cookie", sessionCookie(res)}})) == 200);

    // Email case and spaces don't matter at login either.
    CHECK(status(post(client, "/api/login", {{"email", " ANA@scu.edu"}, {"password", "correct horse"}})) == 200);

    auto wrong = post(client, "/api/login", {{"email", "ana@scu.edu"}, {"password", "Correct horse"}});
    CHECK(status(wrong) == 401);
    CHECK(body(wrong)["error"] == "Wrong email or password");
    CHECK(wrong && wrong->get_header_value("Set-Cookie").empty());

    auto unknown = post(client, "/api/login", {{"email", "nobody@scu.edu"}, {"password", "correct horse"}});
    CHECK(status(unknown) == 401);
    CHECK(body(unknown)["error"] == "Wrong email or password");

    CHECK(status(client.Post("/api/login", "{}", "application/json")) == 400);

    // A password over 256 characters is just a wrong password.
    CHECK(status(post(client, "/api/login", {{"email", "ana@scu.edu"}, {"password", std::string(300, 'x')}})) == 401);

    // Logging in again from the same browser ends the session it had before.
    auto first = post(client, "/api/login", {{"email", "ana@scu.edu"}, {"password", "correct horse"}});
    std::string firstCookie = sessionCookie(first);
    auto again = client.Post("/api/login", {{"Cookie", firstCookie}},
                             R"({"email": "ana@scu.edu", "password": "correct horse"})", "application/json");
    CHECK(status(again) == 200);
    CHECK(status(client.Get("/api/me", {{"Cookie", firstCookie}})) == 401);
    CHECK(status(client.Get("/api/me", {{"Cookie", sessionCookie(again)}})) == 200);
  }

  // Without a valid session, /api/me is a 401 (the plan routes are checked below).
  {
    CHECK(status(client.Get("/api/me")) == 401);
    CHECK(status(client.Get("/api/me", {{"Cookie", "session=not-a-real-token"}})) == 401);
    CHECK(status(client.Get("/api/me", {{"Cookie", "session="}})) == 401);
  }

  // An expired session is a 401, even though the token exists.
  {
    int studentId = db.findStudentByEmail("ana@scu.edu")->studentId;
    std::string token = auth::newSessionToken();
    db.createSession(token, studentId, -1);
    CHECK(status(client.Get("/api/me", {{"Cookie", "session=" + token}})) == 401);
    CHECK(status(client.Get("/api/me/plans", {{"Cookie", "session=" + token}})) == 401);

    // The cookie is found among other cookies.
    std::string fresh = auth::newSessionToken();
    db.createSession(fresh, studentId, 60);
    CHECK(status(client.Get("/api/me", {{"Cookie", "theme=dark; session=" + fresh + "; other=1"}})) == 200);
  }

  // Logout ends the session and clears the cookie.
  {
    auto res = post(client, "/api/login", {{"email", "ana@scu.edu"}, {"password", "correct horse"}});
    std::string cookie = sessionCookie(res);
    CHECK(status(client.Get("/api/me", {{"Cookie", cookie}})) == 200);

    auto out = client.Post("/api/logout", {{"Cookie", cookie}}, "", "application/json");
    CHECK(status(out) == 204);
    CHECK(out && out->get_header_value("Set-Cookie").find("Max-Age=0") != std::string::npos);
    CHECK(status(client.Get("/api/me", {{"Cookie", cookie}})) == 401);

    // Logging out again, or without a cookie, is fine.
    CHECK(status(client.Post("/api/logout", {{"Cookie", cookie}}, "", "application/json")) == 204);
    CHECK(status(client.Post("/api/logout", "", "application/json")) == 204);
  }

  // ---- My plan ----

  auto alice = newStudent("alice@scu.edu");
  // The URL of a student's first plan, the "Main plan" sign-up made.
  auto mainPlanUrl = [&](httplib::Client& c) {
    json plans = body(c.Get("/api/me/plans"));
    int id = plans.empty() ? 0 : plans[0].value("planId", 0);
    return "/api/me/plans/" + std::to_string(id);
  };
  const std::string alicePlan = mainPlanUrl(*alice);
  auto put = [&](const std::string& path, const std::string& body) {
    return alice->Put(path, body, "application/json");
  };

  // Sign-up makes an empty "Main plan" with no emphasis, so there's always a plan.
  {
    json plans = body(alice->Get("/api/me/plans"));
    CHECK(plans.size() == 1);
    CHECK(plans[0]["name"] == "Main plan");
    CHECK(plans[0]["programId"].is_null());
    json plan = body(alice->Get(alicePlan));
    CHECK(plan["courses"].empty());
    CHECK(plans[0]["planId"] == plan["planId"]);
  }

  // The old route without a plan id is gone; the frontend uses /api/me/plans/:planId.
  {
    CHECK(status(alice->Get("/api/me/plan")) == 404);
    CHECK(status(put("/api/me/plan", R"({"courses": []})")) == 404);
  }

  // PUT then GET returns the courses in the order they were added within each quarter.
  {
    auto res = put(alicePlan, R"({"courses": [
      {"code": "CSCI 60", "quarter": 1, "status": "planned"},
      {"code": "CSCI 10", "quarter": 0, "status": "completed"},
      {"code": "MATH 11", "quarter": 0, "status": "planned"}
    ]})");
    CHECK(status(res) == 200);
    json saved = body(res);
    CHECK(saved["planId"].is_number_integer());
    CHECK(saved["lastSaved"].is_string());

    auto got = alice->Get(alicePlan);
    CHECK(status(got) == 200);
    json plan = body(got);
    CHECK(plan["lastSaved"] == saved["lastSaved"]);
    CHECK(plan["courses"] == json::parse(R"([
      {"code": "CSCI 10", "quarter": 0, "status": "completed"},
      {"code": "MATH 11", "quarter": 0, "status": "planned"},
      {"code": "CSCI 60", "quarter": 1, "status": "planned"}
    ])"));
  }

  // PUT replaces everything saved before.
  {
    put(alicePlan, R"({"courses": [{"code": "CSCI 61", "quarter": 3, "status": "planned"}]})");
    json plan = body(alice->Get(alicePlan));
    CHECK(plan["courses"].size() == 1);
    CHECK(plan["courses"][0]["code"] == "CSCI 61");

    CHECK(status(put(alicePlan, R"({"courses": []})")) == 200);
    CHECK(body(alice->Get(alicePlan))["courses"].empty());
  }

  // Bad bodies are 400s, and a rejected save doesn't change the plan.
  {
    put(alicePlan, R"({"courses": [{"code": "CSCI 10", "quarter": 0, "status": "planned"}]})");
    const char* bad[] = {
        "not json",
        R"([])",
        R"({})",
        R"({"courses": "CSCI 10"})",
        R"({"courses": [{"code": "CSCI 10", "quarter": 12, "status": "planned"}]})",
        R"({"courses": [{"code": "CSCI 10", "quarter": -1, "status": "planned"}]})",
        R"({"courses": [{"code": "CSCI 10", "quarter": 4294967296, "status": "planned"}]})",
        R"({"courses": [{"code": "CSCI 10", "quarter": 0, "status": "done"}]})",
        R"({"courses": [{"code": "CSCI 10", "quarter": "0", "status": "planned"}]})",
        R"({"courses": [{"code": "FAKE 1", "quarter": 0, "status": "planned"}]})",
        R"({"courses": [{"code": "CSCI 10", "quarter": 0, "status": "planned"},
                        {"code": "CSCI 10", "quarter": 1, "status": "planned"}]})",
        // Retakes: only after a failed attempt, and only in a later quarter.
        R"({"courses": [{"code": "CSCI 10", "quarter": 0, "status": "completed"},
                        {"code": "CSCI 10", "quarter": 1, "status": "planned"}]})",
        R"({"courses": [{"code": "CSCI 10", "quarter": 0, "status": "failed"},
                        {"code": "CSCI 10", "quarter": 0, "status": "planned"}]})",
        R"({"courses": [{"code": "CSCI 10", "quarter": 1, "status": "failed"},
                        {"code": "CSCI 10", "quarter": 0, "status": "planned"}]})",
        R"({"courses": [{"code": "CSCI 10", "quarter": 0, "status": "planned"},
                        {"code": "CSCI 10", "quarter": 1, "status": "failed"}]})",
        // A failed course still counts toward its quarter's 18 units (5 + 5 + 4 + 4 + 4).
        R"({"courses": [{"code": "CSCI 10", "quarter": 0, "status": "failed"},
                        {"code": "CSCI 60", "quarter": 0, "status": "planned"},
                        {"code": "MATH 11", "quarter": 0, "status": "planned"},
                        {"code": "MATH 12", "quarter": 0, "status": "planned"},
                        {"code": "MATH 13", "quarter": 0, "status": "planned"}]})",
    };
    for (const char* bad_body : bad) {
      auto res = put(alicePlan, bad_body);
      if (status(res) != 400) std::cerr << "Expected 400 for: " << bad_body << "\n";
      CHECK(status(res) == 400);
    }
    // A valid body that isn't sent as JSON.
    CHECK(status(alice->Put(alicePlan, R"({"courses": []})", "text/plain")) == 400);
    json plan = body(alice->Get(alicePlan));
    CHECK(plan["courses"].size() == 1);
  }

  // A failed course can be retaken in a later quarter, more than once, and every attempt is
  // saved with its status. Rows can come in any order.
  {
    auto res = put(alicePlan, R"({"courses": [
      {"code": "CSCI 10", "quarter": 2, "status": "planned"},
      {"code": "CSCI 10", "quarter": 0, "status": "failed"},
      {"code": "CSCI 10", "quarter": 1, "status": "failed"}
    ]})");
    CHECK(status(res) == 200);
    json retakes = json::parse(R"([
      {"code": "CSCI 10", "quarter": 0, "status": "failed"},
      {"code": "CSCI 10", "quarter": 1, "status": "failed"},
      {"code": "CSCI 10", "quarter": 2, "status": "planned"}
    ])");
    CHECK(body(alice->Get(alicePlan))["courses"] == retakes);

    // Copying the plan copies every attempt, and deleting the copy leaves the original.
    int mainId = body(alice->Get(alicePlan))["planId"];
    auto copy = alice->Post("/api/me/plans", json{{"name", "Copy"}, {"copyFrom", mainId}}.dump(), "application/json");
    CHECK(status(copy) == 201);
    int copyId = body(copy)["planId"];
    CHECK(body(alice->Get("/api/me/plans/" + std::to_string(copyId)))["courses"] == retakes);
    CHECK(status(alice->Delete("/api/me/plans/" + std::to_string(copyId))) == 204);
    CHECK(body(alice->Get(alicePlan))["courses"] == retakes);
  }

  // A quarter can have at most 18 units, the same limit as the app.
  {
    auto res = put(alicePlan, R"({"courses": [
      {"code": "CSCI 10", "quarter": 0, "status": "planned"},
      {"code": "CSCI 60", "quarter": 0, "status": "planned"},
      {"code": "MATH 11", "quarter": 0, "status": "planned"},
      {"code": "MATH 12", "quarter": 0, "status": "planned"},
      {"code": "MATH 13", "quarter": 1, "status": "planned"}
    ]})");
    CHECK(status(res) == 200);  // exactly 18 units in Year 1 Fall

    res = put(alicePlan, R"({"courses": [
      {"code": "CSCI 10", "quarter": 0, "status": "planned"},
      {"code": "CSCI 60", "quarter": 0, "status": "planned"},
      {"code": "MATH 11", "quarter": 0, "status": "planned"},
      {"code": "MATH 12", "quarter": 0, "status": "planned"},
      {"code": "MATH 13", "quarter": 0, "status": "planned"}
    ]})");
    CHECK(status(res) == 400);
    CHECK(body(res)["error"] == "Year 1 Fall can't have more than 18 units");
    CHECK(body(alice->Get(alicePlan))["courses"].size() == 5);  // unchanged
  }

  // One student can't see or change another's plan.
  {
    auto bob = newStudent("bob@scu.edu");
    const std::string bobPlan = mainPlanUrl(*bob);
    CHECK(bobPlan != alicePlan);
    CHECK(body(bob->Get(bobPlan))["courses"].empty());  // Bob gets his own empty plan, not Alice's
    CHECK(status(bob->Get(alicePlan)) == 404);

    auto res = bob->Put(bobPlan, R"({"courses": [{"code": "CHEM 11", "quarter": 5, "status": "planned"}]})",
                        "application/json");
    CHECK(status(res) == 200);
    CHECK(body(res)["planId"] != body(alice->Get(alicePlan))["planId"]);
    CHECK(body(bob->Get(bobPlan))["courses"].size() == 1);
    CHECK(body(alice->Get(alicePlan))["courses"].size() == 5);  // Alice's plan is unchanged

    // The old routes that took a plan id from the URL are gone.
    CHECK(status(bob->Get("/api/plans/1")) == 404);
    CHECK(status(bob->Put("/api/plans/1", R"({"courses": []})", "application/json")) == 404);
  }

  // ---- Several plans ----

  // Every plans route needs a login.
  {
    CHECK(status(client.Get("/api/me/plans")) == 401);
    CHECK(status(client.Post("/api/me/plans", R"({"name": "x"})", "application/json")) == 401);
    CHECK(status(client.Get("/api/me/plans/1")) == 401);
    CHECK(status(client.Put("/api/me/plans/1", R"({"courses": []})", "application/json")) == 401);
    CHECK(status(client.Patch("/api/me/plans/1", R"({"name": "x"})", "application/json")) == 401);
    CHECK(status(client.Delete("/api/me/plans/1")) == 401);
  }

  {
    auto planUrl = [](int id) { return "/api/me/plans/" + std::to_string(id); };
    auto postPlan = [&](httplib::Client& c, const json& b) { return c.Post("/api/me/plans", b.dump(), "application/json"); };
    auto patchPlan = [&](httplib::Client& c, int id, const json& b) {
      return c.Patch(planUrl(id), b.dump(), "application/json");
    };

    // Alice's first plan is named "Main plan", with no emphasis.
    json mainPlan = body(alice->Get(alicePlan));
    int mainId = mainPlan["planId"];
    auto list = alice->Get("/api/me/plans");
    CHECK(status(list) == 200);
    CHECK(body(list).size() == 1);
    CHECK(body(list)[0] == json({{"planId", mainId}, {"name", "Main plan"}, {"programId", nullptr},
                                 {"lastSaved", mainPlan["lastSaved"]}, {"shared", false}}));

    CHECK(mainPlan["courses"].size() == 5);

    // A "what if" copy: trimmed name, an emphasis, and the same courses as the plan it copies.
    auto created = postPlan(*alice, {{"name", "  What if I study abroad "}, {"programId", 2}, {"copyFrom", mainId}});
    CHECK(status(created) == 201);
    json copy = body(created);
    int copyId = copy.value("planId", 0);
    CHECK(copyId != mainId);
    CHECK(copy["name"] == "What if I study abroad");
    CHECK(copy["programId"] == 2);
    CHECK(copy["shared"] == false);
    CHECK(body(alice->Get(planUrl(copyId)))["courses"] == mainPlan["courses"]);
    CHECK(body(alice->Get("/api/me/plans")).size() == 2);

    // Without copyFrom or programId: an empty plan with no emphasis. Oldest plan first in the list.
    auto empty = postPlan(*alice, {{"name", "Blank"}});
    CHECK(status(empty) == 201);
    int emptyId = body(empty).value("planId", 0);
    CHECK(body(empty)["programId"] == nullptr);
    CHECK(body(alice->Get(planUrl(emptyId)))["courses"].empty());
    json all = body(alice->Get("/api/me/plans"));
    CHECK(all.size() == 3 && all[0]["planId"] == mainId && all[2]["planId"] == emptyId);

    // A 60-character name is fine, counting each UTF-8 character once.
    std::string sixty;
    for (int i = 0; i < 60; ++i) sixty += "\xC3\xA9";  // é
    auto longName = postPlan(*alice, {{"name", sixty}});
    CHECK(status(longName) == 201);
    CHECK(status(alice->Delete(planUrl(body(longName).value("planId", 0)))) == 204);

    // Bad bodies are 400s and create nothing.
    const json badPlans[] = {
        json::object(),
        {{"name", ""}},
        {{"name", "   "}},
        {{"name", 5}},
        {{"name", std::string(61, 'x')}},
        {{"name", "x"}, {"programId", 1}},    // the major, not an emphasis
        {{"name", "x"}, {"programId", 999}},  // no such program
        {{"name", "x"}, {"programId", "2"}},
        {{"name", "x"}, {"programId", 4294967298LL}},
        {{"name", "x"}, {"copyFrom", "1"}},
    };
    for (const auto& bad : badPlans) {
      auto res = postPlan(*alice, bad);
      if (status(res) != 400) std::cerr << "Expected 400 for POST /api/me/plans: " << bad.dump() << "\n";
      CHECK(status(res) == 400);
    }
    CHECK(status(alice->Post("/api/me/plans", R"({"name": "x"})", "text/plain")) == 400);
    CHECK(body(alice->Get("/api/me/plans")).size() == 3);

    // PATCH renames and changes the emphasis, each on its own; null clears the emphasis.
    auto renamed = patchPlan(*alice, copyId, {{"name", "Abroad in spring"}});
    CHECK(status(renamed) == 200);
    CHECK(body(renamed)["name"] == "Abroad in spring");
    CHECK(body(renamed)["programId"] == 2);
    auto cleared = patchPlan(*alice, copyId, {{"programId", nullptr}});
    CHECK(body(cleared)["programId"] == nullptr);
    CHECK(body(cleared)["name"] == "Abroad in spring");
    CHECK(body(patchPlan(*alice, copyId, {{"programId", 2}}))["programId"] == 2);
    CHECK(status(patchPlan(*alice, copyId, json::object())) == 200);
    CHECK(status(patchPlan(*alice, copyId, {{"name", ""}})) == 400);
    CHECK(status(patchPlan(*alice, copyId, {{"programId", 1}})) == 400);
    CHECK(body(alice->Get("/api/me/plans"))[1]["name"] == "Abroad in spring");  // unchanged by the 400s

    // PUT saves one plan and leaves the others alone.
    auto saved = alice->Put(planUrl(copyId), R"({"courses": [{"code": "CHEM 11", "quarter": 2, "status": "planned"}]})",
                            "application/json");
    CHECK(status(saved) == 200);
    CHECK(body(saved)["planId"] == copyId);
    CHECK(body(alice->Get(planUrl(copyId)))["courses"].size() == 1);
    CHECK(body(alice->Get(planUrl(mainId)))["courses"] == mainPlan["courses"]);
    CHECK(status(alice->Put(planUrl(copyId), R"({"courses": "nope"})", "application/json")) == 400);
    CHECK(status(alice->Put(planUrl(copyId), R"({"courses": []})", "text/plain")) == 400);

    // Another student's plans are 404s, the same as plans that don't exist.
    auto carol = newStudent("carol@scu.edu");
    json carolsPlans = body(carol->Get("/api/me/plans"));  // only her own "Main plan"
    CHECK(carolsPlans.size() == 1);
    CHECK(carolsPlans[0]["planId"] != mainId);
    CHECK(status(carol->Get(planUrl(mainId))) == 404);
    CHECK(status(carol->Put(planUrl(mainId), R"({"courses": []})", "application/json")) == 404);
    CHECK(status(patchPlan(*carol, mainId, {{"name", "Mine now"}})) == 404);
    CHECK(status(carol->Delete(planUrl(mainId))) == 404);
    CHECK(status(postPlan(*carol, {{"name", "Copy"}, {"copyFrom", mainId}})) == 404);
    CHECK(status(postPlan(*carol, {{"name", "Copy"}, {"copyFrom", 2147483648LL}})) == 404);
    CHECK(body(alice->Get(planUrl(mainId))) == mainPlan);  // untouched
    CHECK(status(alice->Get("/api/me/plans/99999")) == 404);
    CHECK(status(alice->Get("/api/me/plans/99999999999999999999")) == 404);
    CHECK(status(alice->Get("/api/me/plans/abc")) == 404);

    // DELETE removes a plan and its courses, but never the student's last plan.
    CHECK(status(alice->Delete(planUrl(copyId))) == 204);
    CHECK(status(alice->Get(planUrl(copyId))) == 404);
    CHECK(status(alice->Delete(planUrl(copyId))) == 404);
    CHECK(status(alice->Delete(planUrl(emptyId))) == 204);
    auto last = alice->Delete(planUrl(mainId));
    CHECK(status(last) == 400);
    CHECK(body(last)["error"] == "You need at least one plan");
    CHECK(body(alice->Get("/api/me/plans")).size() == 1);
  }

  // ---- Other credit ----
  // GET /api/me/plans/:planId includes "credits", and PUT replaces them when it sends
  // "credits" and leaves them when it doesn't.
  {
    auto rosa = newStudent("rosa@scu.edu");
    auto url = [](int id) { return "/api/me/plans/" + std::to_string(id); };
    auto putJson = [&](httplib::Client& c, int id, const json& b) { return c.Put(url(id), b.dump(), "application/json"); };
    int planId = body(rosa->Get("/api/me/plans"))[0].value("planId", 0);
    json courses = json::parse(R"([{"code": "CSCI 10", "quarter": 0, "status": "completed"}])");

    // A new plan has no credits.
    CHECK(body(rosa->Get(url(planId)))["credits"] == json::array());

    // Saved credits come back in the order they were sent. requirementId is optional and
    // defaults to null; descriptions are trimmed.
    json credits = json::parse(R"([
      {"kind": "ap", "description": "AP Calculus BC", "units": 8, "requirementId": 2},
      {"kind": "transfer", "description": "  English 1A at De Anza  ", "units": 4},
      {"kind": "abroad", "description": "Semester in Rome", "units": 12, "requirementId": null},
      {"kind": "core", "description": "Core: Cultures & Ideas", "units": 4, "requirementId": 3},
      {"kind": "elective", "description": "Elective units", "units": 60, "requirementId": null}
    ])");
    CHECK(status(putJson(*rosa, planId, {{"courses", courses}, {"credits", credits}})) == 200);
    json expected = json::parse(R"([
      {"kind": "ap", "description": "AP Calculus BC", "units": 8, "requirementId": 2},
      {"kind": "transfer", "description": "English 1A at De Anza", "units": 4, "requirementId": null},
      {"kind": "abroad", "description": "Semester in Rome", "units": 12, "requirementId": null},
      {"kind": "core", "description": "Core: Cultures & Ideas", "units": 4, "requirementId": 3},
      {"kind": "elective", "description": "Elective units", "units": 60, "requirementId": null}
    ])");
    json saved = body(rosa->Get(url(planId)));
    CHECK(saved["credits"] == expected);
    CHECK(saved["courses"] == courses);

    // A PUT without "credits" (what the app sends today) changes the courses and keeps them.
    CHECK(status(putJson(*rosa, planId, {{"courses", json::array()}})) == 200);
    saved = body(rosa->Get(url(planId)));
    CHECK(saved["credits"] == expected);
    CHECK(saved["courses"] == json::array());

    // A copied plan gets the credits too; changing the copy's credits leaves the original's.
    auto copy = rosa->Post("/api/me/plans", json{{"name", "What if"}, {"copyFrom", planId}}.dump(), "application/json");
    CHECK(status(copy) == 201);
    int copyId = body(copy).value("planId", 0);
    CHECK(body(rosa->Get(url(copyId)))["credits"] == expected);
    json one = json::parse(R"([{"kind": "ap", "description": "AP Physics C", "units": 4}])");
    CHECK(status(putJson(*rosa, copyId, {{"courses", json::array()}, {"credits", one}})) == 200);
    CHECK(body(rosa->Get(url(copyId)))["credits"].size() == 1);
    CHECK(body(rosa->Get(url(planId)))["credits"] == expected);
    // An empty plan doesn't copy anything.
    auto blank = rosa->Post("/api/me/plans", json{{"name", "Blank"}}.dump(), "application/json");
    CHECK(body(rosa->Get(url(body(blank).value("planId", 0))))["credits"] == json::array());

    // "credits": [] removes them all.
    CHECK(status(putJson(*rosa, copyId, {{"courses", json::array()}, {"credits", json::array()}})) == 200);
    CHECK(body(rosa->Get(url(copyId)))["credits"] == json::array());

    // Bad credits are 400s, and a rejected save changes neither the credits nor the courses.
    const char* bad[] = {
        R"({"courses": [], "credits": "nope"})",
        R"({"courses": [], "credits": null})",
        R"({"courses": [], "credits": [5]})",
        R"({"courses": [], "credits": [{"description": "x", "units": 4}]})",
        R"({"courses": [], "credits": [{"kind": "AP", "description": "x", "units": 4}]})",
        R"({"courses": [], "credits": [{"kind": "online", "description": "x", "units": 4}]})",
        R"({"courses": [], "credits": [{"kind": "ap", "units": 4}]})",
        R"({"courses": [], "credits": [{"kind": "ap", "description": "   ", "units": 4}]})",
        R"({"courses": [], "credits": [{"kind": "ap", "description": 7, "units": 4}]})",
        R"({"courses": [], "credits": [{"kind": "ap", "description": "x"}]})",
        R"({"courses": [], "credits": [{"kind": "ap", "description": "x", "units": 0}]})",
        R"({"courses": [], "credits": [{"kind": "ap", "description": "x", "units": 61}]})",
        R"({"courses": [], "credits": [{"kind": "ap", "description": "x", "units": -4}]})",
        R"({"courses": [], "credits": [{"kind": "ap", "description": "x", "units": 4.5}]})",
        R"({"courses": [], "credits": [{"kind": "ap", "description": "x", "units": "4"}]})",
        R"({"courses": [], "credits": [{"kind": "ap", "description": "x", "units": 4294967297}]})",
        R"({"courses": [], "credits": [{"kind": "ap", "description": "x", "units": 4, "requirementId": "2"}]})",
        R"({"courses": [], "credits": [{"kind": "ap", "description": "x", "units": 4, "requirementId": 99999}]})",
        R"({"courses": [], "credits": [{"kind": "ap", "description": "x", "units": 4, "requirementId": 0}]})",
        R"({"courses": [], "credits": [{"kind": "ap", "description": "x", "units": 4, "requirementId": 4294967298}]})",
        R"({"credits": []})",
    };
    for (const char* badBody : bad) {
      auto res = rosa->Put(url(planId), badBody, "application/json");
      if (status(res) != 400) std::cerr << "Expected 400 for credits: " << badBody << "\n";
      CHECK(status(res) == 400);
    }
    json longDescription = {{"kind", "ap"}, {"description", std::string(101, 'x')}, {"units", 4}};
    CHECK(status(putJson(*rosa, planId, {{"courses", json::array()}, {"credits", {longDescription}}})) == 400);
    longDescription["description"] = std::string(100, 'x');  // exactly 100 is fine (checked on the copy)
    CHECK(status(putJson(*rosa, copyId, {{"courses", json::array()}, {"credits", {longDescription}}})) == 200);
    json tooMany = json::array();
    for (int i = 0; i < 101; ++i) tooMany.push_back({{"kind", "elective"}, {"description", "Units"}, {"units", 1}});
    CHECK(status(putJson(*rosa, planId, {{"courses", json::array()}, {"credits", tooMany}})) == 400);
    CHECK(body(rosa->Get(url(planId)))["credits"] == expected);

    // A bad credit also rejects the courses sent with it.
    json oneBad = json::parse(R"([{"kind": "ap", "description": "x", "units": 0}])");
    CHECK(status(putJson(*rosa, planId, {{"courses", courses}, {"credits", oneBad}})) == 400);
    CHECK(body(rosa->Get(url(planId)))["courses"] == json::array());

    // Another student can't read or change them.
    auto sam = newStudent("sam@scu.edu");
    CHECK(status(sam->Get(url(planId))) == 404);
    CHECK(status(putJson(*sam, planId, {{"courses", json::array()}, {"credits", json::array()}})) == 404);
    CHECK(body(rosa->Get(url(planId)))["credits"] == expected);

    // Deleting a plan deletes its credits with it.
    CHECK(status(rosa->Delete(url(copyId))) == 204);
    CHECK(status(rosa->Get(url(copyId))) == 404);
  }

  // ---- Finished quarters ----
  // PATCH /api/me confirms every quarter through confirmedThrough, using one plan's courses
  // and results, and copies those quarters into the student's other plans.
  {
    auto patchMe = [&](httplib::Client& c, const json& b) { return c.Patch("/api/me", b.dump(), "application/json"); };
    CHECK(status(client.Patch("/api/me", R"({"confirmedThrough": 0, "planId": 1})", "application/json")) == 401);

    // Quinn started in Fall 2024, so Year 1 and Year 2 (quarters 0 to 5) have ended.
    auto quinn = newStudent("quinn@scu.edu");
    CHECK(body(quinn->Get("/api/me"))["confirmedThrough"].is_null());
    const std::string mainUrl = mainPlanUrl(*quinn);
    int mainId = body(quinn->Get(mainUrl))["planId"];
    CHECK(status(quinn->Put(mainUrl, R"({"courses": [
      {"code": "CSCI 10", "quarter": 0, "status": "completed"},
      {"code": "MATH 11", "quarter": 0, "status": "failed"},
      {"code": "CSCI 60", "quarter": 1, "status": "completed"},
      {"code": "MATH 11", "quarter": 1, "status": "completed"},
      {"code": "CSCI 61", "quarter": 4, "status": "planned"}
    ]})", "application/json")) == 200);
    json mainBefore = body(quinn->Get(mainUrl));

    // A "what if" plan with a different past, and a later course of its own.
    int abroadId = body(quinn->Post("/api/me/plans", R"({"name": "Abroad"})", "application/json")).value("planId", 0);
    const std::string abroadUrl = "/api/me/plans/" + std::to_string(abroadId);
    CHECK(status(quinn->Put(abroadUrl, R"({"courses": [
      {"code": "CHEM 11", "quarter": 0, "status": "planned"},
      {"code": "CSCI 60", "quarter": 1, "status": "planned"},
      {"code": "CSCI 62", "quarter": 6, "status": "planned"}
    ]})", "application/json")) == 200);
    std::string abroadSaved = body(quinn->Get(abroadUrl))["lastSaved"];

    // Bad bodies are 400s, and plans that aren't Quinn's are 404s. Nothing changes.
    const json badBodies[] = {
        json::object(),
        {{"planId", mainId}},
        {{"confirmedThrough", "1"}, {"planId", mainId}},
        {{"confirmedThrough", nullptr}, {"planId", mainId}},
        {{"confirmedThrough", 12}, {"planId", mainId}},
        {{"confirmedThrough", -1}, {"planId", mainId}},
        {{"confirmedThrough", 4294967296LL}, {"planId", mainId}},
        {{"confirmedThrough", 1}},
        {{"confirmedThrough", 1}, {"planId", std::to_string(mainId)}},
    };
    for (const auto& bad : badBodies) {
      auto res = patchMe(*quinn, bad);
      if (status(res) != 400) std::cerr << "Expected 400 for PATCH /api/me: " << bad.dump() << "\n";
      CHECK(status(res) == 400);
    }
    CHECK(status(quinn->Patch("/api/me", json{{"confirmedThrough", 1}, {"planId", mainId}}.dump(), "text/plain")) == 400);
    int alicesId = body(alice->Get("/api/me/plans"))[0]["planId"];
    CHECK(status(patchMe(*quinn, {{"confirmedThrough", 1}, {"planId", alicesId}})) == 404);
    CHECK(status(patchMe(*quinn, {{"confirmedThrough", 1}, {"planId", 99999}})) == 404);
    CHECK(status(patchMe(*quinn, {{"confirmedThrough", 1}, {"planId", 2147483648LL}})) == 404);
    CHECK(body(quinn->Get("/api/me"))["confirmedThrough"].is_null());
    CHECK(body(quinn->Get(abroadUrl))["lastSaved"] == abroadSaved);

    // Confirming through Year 1 Winter copies quarters 0 and 1, results and retakes included,
    // into "Abroad", which keeps its own later courses. The main plan is unchanged.
    auto confirmed = patchMe(*quinn, {{"confirmedThrough", 1}, {"planId", mainId}});
    CHECK(status(confirmed) == 200);
    CHECK(body(confirmed) == json({{"email", "quinn@scu.edu"}, {"startYear", 2024}, {"confirmedThrough", 1}}));
    CHECK(body(quinn->Get("/api/me"))["confirmedThrough"] == 1);
    json abroad = body(quinn->Get(abroadUrl));
    CHECK(abroad["courses"] == json::parse(R"([
      {"code": "CSCI 10", "quarter": 0, "status": "completed"},
      {"code": "MATH 11", "quarter": 0, "status": "failed"},
      {"code": "CSCI 60", "quarter": 1, "status": "completed"},
      {"code": "MATH 11", "quarter": 1, "status": "completed"},
      {"code": "CSCI 62", "quarter": 6, "status": "planned"}
    ])"));
    CHECK(abroad["lastSaved"] != abroadSaved);
    CHECK(body(quinn->Get(mainUrl)) == mainBefore);
    // Other students' plans and confirmations aren't touched.
    CHECK(body(alice->Get("/api/me"))["confirmedThrough"].is_null());
    CHECK(body(alice->Get(alicePlan))["courses"].size() == 5);

    // Every course in a confirmed quarter needs a result: CSCI 61 in quarter 4 is still planned.
    auto planned = patchMe(*quinn, {{"confirmedThrough", 4}, {"planId", mainId}});
    CHECK(status(planned) == 400);
    CHECK(body(planned)["error"] == "CSCI 61 in Year 2 Winter needs a result: completed or failed");
    CHECK(body(quinn->Get("/api/me"))["confirmedThrough"] == 1);

    // Passing CSCI 62 in Year 1 Spring would leave "Abroad" taking it again in Year 3 Fall,
    // so nothing is confirmed or copied until that plan is changed.
    json courses = mainBefore["courses"];
    courses.push_back({{"code", "CSCI 62"}, {"quarter", 2}, {"status", "completed"}});
    CHECK(status(quinn->Put(mainUrl, json{{"courses", courses}}.dump(), "application/json")) == 200);
    auto conflict = patchMe(*quinn, {{"confirmedThrough", 2}, {"planId", mainId}});
    CHECK(status(conflict) == 400);
    CHECK(body(conflict)["error"] ==
          "In \"Abroad\": CSCI 62 is in the plan more than once; only a failed attempt can be retaken");
    CHECK(body(quinn->Get("/api/me"))["confirmedThrough"] == 1);
    CHECK(body(quinn->Get(abroadUrl)) == abroad);

    // Once "Abroad" drops it, the confirmation goes through.
    CHECK(status(quinn->Put(abroadUrl, R"({"courses": []})", "application/json")) == 200);
    CHECK(status(patchMe(*quinn, {{"confirmedThrough", 2}, {"planId", mainId}})) == 200);
    CHECK(body(quinn->Get(abroadUrl))["courses"].size() == 5);

    // A quarter that hasn't ended yet is a 400. Rex starts in 2100.
    auto rex = std::make_unique<httplib::Client>("127.0.0.1", port);
    auto signup = post(*rex, "/api/signup", {{"email", "rex@scu.edu"}, {"password", "correct horse"}, {"startYear", 2100}});
    rex->set_default_headers({{"Cookie", sessionCookie(signup)}});
    int rexPlan = body(rex->Get("/api/me/plans"))[0]["planId"];
    auto early = patchMe(*rex, {{"confirmedThrough", 0}, {"planId", rexPlan}});
    CHECK(status(early) == 400);
    CHECK(body(early)["error"] == "Year 1 Fall hasn't ended yet");
    CHECK(body(rex->Get("/api/me"))["confirmedThrough"].is_null());
  }

  // GET /api/programs needs a login and lists every program in programs.json, by id.
  {
    CHECK(status(client.Get("/api/programs")) == 401);
    auto res = alice->Get("/api/programs");
    CHECK(status(res) == 200);
    // R"json(...)json" because the name has )" in it, which would end a plain R"(...)".
    CHECK(body(res) == json::parse(R"json([
      {"programId": 1, "name": "Computer Science (B.S.)", "kind": "major"},
      {"programId": 2, "name": "Software", "kind": "emphasis"},
      {"programId": 3, "name": "Algorithms and Complexity", "kind": "emphasis"},
      {"programId": 4, "name": "Data Science", "kind": "emphasis"},
      {"programId": 5, "name": "Security", "kind": "emphasis"},
      {"programId": 6, "name": "University Core", "kind": "core"}
    ])json"));
    // Reseeding keeps the ids.
    db.seed(DEFAULT_DATA_DIR);
    CHECK(body(alice->Get("/api/programs")).size() == 6);
  }

  // Unknown routes are a 404 with an error message.
  {
    auto res = client.Get("/api/nope");
    CHECK(status(res) == 404);
    CHECK(body(res)["error"] == "Not found");
  }

  // Reseeding keeps saved plans.
  {
    db.seed(DEFAULT_DATA_DIR);
    json plan = body(alice->Get(alicePlan));
    CHECK(plan["courses"].size() == 5);
  }

  alice.reset();
  server.stop();
  thread.join();

  // A plan saved to a database file is still there after the server restarts.
  {
    auto path = std::filesystem::temp_directory_path() / "degree_planner_api_test.db";
    std::filesystem::remove(path);
    {
      Database first(path.string());
      first.seed(DEFAULT_DATA_DIR);
      int studentId = first.createStudent("carol@scu.edu", auth::hashPassword("correct horse"), 2024);
      first.createSession("carols-token", studentId, 60);
      first.savePlan(studentId, firstPlanId(first, studentId), {{"CSCI 10", 0, "completed"}, {"CSCI 60", 1, "planned"}},
                     std::vector<PlanCredit>{{"ap", "AP Calculus BC", 8, 2}});
    }
    Database second(path.string());
    second.seed(DEFAULT_DATA_DIR);
    // The account, its session and its plan all survive.
    auto login = second.findStudentByEmail("carol@scu.edu");
    CHECK(login && auth::verifyPassword("correct horse", login->passwordHash));
    CHECK(second.studentForSession("carols-token") == login->studentId);
    auto plan = firstPlan(second, login->studentId);
    CHECK(plan && (*plan)["courses"] == json::parse(R"([
      {"code": "CSCI 10", "quarter": 0, "status": "completed"},
      {"code": "CSCI 60", "quarter": 1, "status": "planned"}
    ])"));
    // Its other credit too.
    CHECK(plan && (*plan)["credits"] == json::parse(R"([
      {"kind": "ap", "description": "AP Calculus BC", "units": 8, "requirementId": 2}
    ])"));
    std::filesystem::remove(path);
  }

  // A database from before several plans: degree_plan has no name or program_id. The
  // columns are added and the saved plan becomes "Main plan", with its courses kept.
  {
    auto path = std::filesystem::temp_directory_path() / "degree_planner_one_plan_test.db";
    std::filesystem::remove(path);
    sqlite3* old = nullptr;
    sqlite3_open(path.string().c_str(), &old);
    sqlite3_exec(old, R"sql(
      CREATE TABLE student (student_id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE,
                            password_hash TEXT NOT NULL, start_year INTEGER NOT NULL);
      CREATE TABLE degree_plan (plan_id INTEGER PRIMARY KEY,
                                student_id INTEGER NOT NULL REFERENCES student(student_id) ON DELETE CASCADE,
                                last_saved TEXT NOT NULL);
      INSERT INTO student VALUES (1, 'fay@scu.edu', 'not-a-real-hash', 2024);
      INSERT INTO degree_plan VALUES (7, 1, '2026-11-01T00:00:00.000Z');
    )sql", nullptr, nullptr, nullptr);
    sqlite3_close(old);
    {
      Database migrated(path.string());
      migrated.seed(DEFAULT_DATA_DIR);
      migrated.savePlan(1, firstPlanId(migrated, 1), {{"CSCI 10", 0, "planned"}});
      json plans = migrated.plans(1);
      CHECK(plans.size() == 1);
      CHECK(plans[0]["planId"] == 7);
      CHECK(plans[0]["name"] == "Main plan");
      CHECK(plans[0]["programId"] == nullptr);
      auto plan = migrated.planById(1, 7);
      CHECK(plan && (*plan)["courses"].size() == 1);
      // confirmed_through is added too, empty for students from before it.
      CHECK(!migrated.confirmedThrough(1));
      CHECK(migrated.student(1).has_value());
    }
    {
      Database reopened(path.string());  // opening again doesn't add the columns twice
      CHECK(reopened.plans(1).size() == 1);
      CHECK(!reopened.confirmedThrough(1));
    }
    std::filesystem::remove(path);
  }

  // A database from before accounts: its plans have no owner, so they're dropped and
  // degree_plan is recreated with student_id. Everything else still works.
  {
    auto path = std::filesystem::temp_directory_path() / "degree_planner_old_schema_test.db";
    std::filesystem::remove(path);
    sqlite3* old = nullptr;
    sqlite3_open(path.string().c_str(), &old);
    sqlite3_exec(old, R"sql(
      CREATE TABLE degree_plan (plan_id INTEGER PRIMARY KEY, last_saved TEXT NOT NULL);
      CREATE TABLE plan_course (plan_id INTEGER, course_id INTEGER, quarter INTEGER, status TEXT, position INTEGER);
      INSERT INTO degree_plan VALUES (1, '2026-10-01T00:00:00.000Z');
      INSERT INTO plan_course VALUES (1, 1, 0, 'planned', 0);
    )sql", nullptr, nullptr, nullptr);
    sqlite3_close(old);
    {
      Database migrated(path.string());
      migrated.seed(DEFAULT_DATA_DIR);
      int studentId = migrated.createStudent("dana@scu.edu", auth::hashPassword("correct horse"), 2025);
      // The ownerless plan was dropped, so her own new "Main plan" is empty.
      auto own = firstPlan(migrated, studentId);
      CHECK(own && (*own)["courses"].empty());
      migrated.savePlan(studentId, firstPlanId(migrated, studentId), {{"CSCI 10", 0, "planned"}});
      auto plan = firstPlan(migrated, studentId);
      CHECK(plan && (*plan)["courses"].size() == 1);
    }
    std::filesystem::remove(path);
  }

  // A database from before programs: degree_requirement has no program_id or units yet.
  // They're added, and the reseed fills them in.
  {
    auto path = std::filesystem::temp_directory_path() / "degree_planner_no_programs_test.db";
    std::filesystem::remove(path);
    sqlite3* old = nullptr;
    sqlite3_open(path.string().c_str(), &old);
    sqlite3_exec(old, R"sql(
      CREATE TABLE degree_requirement (requirement_id INTEGER PRIMARY KEY, description TEXT NOT NULL,
                                       count INTEGER NOT NULL);
      INSERT INTO degree_requirement VALUES (1, 'Lower-division computer science', 4);
    )sql", nullptr, nullptr, nullptr);
    sqlite3_close(old);
    {
      Database migrated(path.string());
      migrated.seed(DEFAULT_DATA_DIR);
      json reqs = migrated.requirements();
      CHECK(reqs.size() == 33);
      CHECK(reqs[0]["programId"] == 1);
      CHECK(reqs.back()["units"] == 16);
    }
    std::filesystem::remove(path);
  }

  // A database from before retakes: plan_course allowed each course once per plan and had
  // no 'failed' status. It's rebuilt with every saved row kept, and retakes then save.
  {
    auto path = std::filesystem::temp_directory_path() / "degree_planner_before_retakes_test.db";
    std::filesystem::remove(path);
    {
      Database fresh(path.string());  // today's tables, then plan_course swapped for the old one
      fresh.seed(DEFAULT_DATA_DIR);
      int studentId = fresh.createStudent("erin@scu.edu", auth::hashPassword("correct horse"), 2025);
      fresh.savePlan(studentId, firstPlanId(fresh, studentId), {{"CSCI 10", 0, "completed"}, {"MATH 11", 0, "planned"}});
    }
    sqlite3* old = nullptr;
    sqlite3_open(path.string().c_str(), &old);
    sqlite3_exec(old, R"sql(
      CREATE TABLE plan_course_old (
        plan_id   INTEGER NOT NULL REFERENCES degree_plan(plan_id) ON DELETE CASCADE,
        course_id INTEGER NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
        quarter   INTEGER NOT NULL CHECK (quarter BETWEEN 0 AND 11),
        status    TEXT NOT NULL CHECK (status IN ('planned', 'completed')),
        position  INTEGER NOT NULL,
        PRIMARY KEY (plan_id, course_id));
      INSERT INTO plan_course_old SELECT plan_id, course_id, quarter, status, position FROM plan_course;
      DROP TABLE plan_course;
      ALTER TABLE plan_course_old RENAME TO plan_course;
    )sql", nullptr, nullptr, nullptr);
    sqlite3_close(old);
    {
      Database migrated(path.string());
      migrated.seed(DEFAULT_DATA_DIR);
      auto login = migrated.findStudentByEmail("erin@scu.edu");
      CHECK(login.has_value());
      auto plan = firstPlan(migrated, login->studentId);
      CHECK(plan && (*plan)["courses"] == json::parse(R"([
        {"code": "CSCI 10", "quarter": 0, "status": "completed"},
        {"code": "MATH 11", "quarter": 0, "status": "planned"}
      ])"));
      migrated.savePlan(login->studentId, firstPlanId(migrated, login->studentId), {{"MATH 11", 0, "failed"}, {"MATH 11", 1, "planned"}});
      plan = firstPlan(migrated, login->studentId);
      CHECK(plan && (*plan)["courses"].size() == 2);

      // The rebuilt table still deletes a plan's courses with the plan.
      json copy = migrated.createPlan(login->studentId, "Copy", std::nullopt, (*plan)["planId"].get<int>());
      migrated.deletePlan(login->studentId, copy["planId"].get<int>());
    }
    auto count = [&](const char* sql) {
      sqlite3* db = nullptr;
      sqlite3_open(path.string().c_str(), &db);
      sqlite3_stmt* stmt = nullptr;
      sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr);
      int n = sqlite3_step(stmt) == SQLITE_ROW ? sqlite3_column_int(stmt, 0) : -1;
      sqlite3_finalize(stmt);
      sqlite3_close(db);
      return n;
    };
    CHECK(count("SELECT COUNT(*) FROM plan_course") == 2);  // only the main plan's rows are left
    CHECK(count("SELECT COUNT(*) FROM pragma_foreign_key_list('plan_course') WHERE on_delete = 'CASCADE'") == 2);
    {
      Database again(path.string());  // a second start doesn't rebuild or lose anything
      auto login = again.findStudentByEmail("erin@scu.edu");
      auto plan = firstPlan(again, login->studentId);
      CHECK(plan && (*plan)["courses"].size() == 2);
    }
    CHECK(count("SELECT COUNT(*) FROM pragma_table_info('plan_course') WHERE pk > 0") == 3);
    std::filesystem::remove(path);
  }

  // Students who signed up before sign-up made a plan, and never saved one, get an empty
  // "Main plan" when the server starts. Students who already have plans get no extra one.
  {
    auto path = std::filesystem::temp_directory_path() / "degree_planner_main_plan_test.db";
    std::filesystem::remove(path);
    int withPlan;
    {
      Database fresh(path.string());
      fresh.seed(DEFAULT_DATA_DIR);
      withPlan = fresh.createStudent("gina@scu.edu", auth::hashPassword("correct horse"), 2025);
      fresh.createPlan(withPlan, "Abroad", std::nullopt, std::nullopt);
    }
    sqlite3* old = nullptr;
    sqlite3_open(path.string().c_str(), &old);
    sqlite3_exec(old, "INSERT INTO student (email, password_hash, start_year) VALUES ('hal@scu.edu', 'x', 2024)",
                 nullptr, nullptr, nullptr);
    int noPlan = static_cast<int>(sqlite3_last_insert_rowid(old));
    sqlite3_close(old);
    {
      Database restarted(path.string());
      json plans = restarted.plans(noPlan);
      CHECK(plans.size() == 1);
      CHECK(plans[0]["name"] == "Main plan");
      CHECK(plans[0]["programId"].is_null());
      CHECK(restarted.plans(withPlan).size() == 2);
    }
    {
      Database again(path.string());  // a second start adds nothing
      CHECK(again.plans(noPlan).size() == 1);
    }
    std::filesystem::remove(path);
  }

  // A deleted plan's id is never given to a new plan, even when it was the newest (#22).
  // A database from before AUTOINCREMENT is rebuilt with every plan, id and course kept.
  {
    auto path = std::filesystem::temp_directory_path() / "degree_planner_plan_ids_test.db";
    std::filesystem::remove(path);
    int studentId;
    int mainId;
    {
      Database fresh(path.string());
      fresh.seed(DEFAULT_DATA_DIR);
      studentId = fresh.createStudent("ivy@scu.edu", auth::hashPassword("correct horse"), 2025);
      mainId = fresh.plans(studentId)[0]["planId"].get<int>();
      int newest = fresh.createPlan(studentId, "Abroad", std::nullopt, std::nullopt)["planId"].get<int>();
      fresh.deletePlan(studentId, newest);
      int next = fresh.createPlan(studentId, "Fresh", std::nullopt, std::nullopt)["planId"].get<int>();
      CHECK(next > newest);
      fresh.deletePlan(studentId, next);
      fresh.savePlan(studentId, firstPlanId(fresh, studentId), {{"CSCI 10", 0, "completed"}, {"MATH 11", 1, "planned"}});
    }
    sqlite3* old = nullptr;
    sqlite3_open(path.string().c_str(), &old);
    // The table as it was before AUTOINCREMENT, with the same rows.
    sqlite3_exec(old, R"sql(
      PRAGMA foreign_keys = OFF;
      CREATE TABLE degree_plan_old (
        plan_id    INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES student(student_id) ON DELETE CASCADE,
        last_saved TEXT NOT NULL,
        name       TEXT NOT NULL DEFAULT 'Main plan',
        program_id INTEGER REFERENCES program(program_id) ON DELETE SET NULL);
      INSERT INTO degree_plan_old SELECT plan_id, student_id, last_saved, name, program_id FROM degree_plan;
      DROP TABLE degree_plan;
      ALTER TABLE degree_plan_old RENAME TO degree_plan;
    )sql", nullptr, nullptr, nullptr);
    sqlite3_close(old);
    auto count = [&](const char* sql) {
      sqlite3* db = nullptr;
      sqlite3_open(path.string().c_str(), &db);
      sqlite3_stmt* stmt = nullptr;
      sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr);
      int n = sqlite3_step(stmt) == SQLITE_ROW ? sqlite3_column_int(stmt, 0) : -1;
      sqlite3_finalize(stmt);
      sqlite3_close(db);
      return n;
    };
    CHECK(count("SELECT COUNT(*) FROM sqlite_master WHERE name = 'degree_plan' AND sql LIKE '%AUTOINCREMENT%'") == 0);
    {
      Database migrated(path.string());
      migrated.seed(DEFAULT_DATA_DIR);
      json plans = migrated.plans(studentId);
      CHECK(plans.size() == 1);
      CHECK(plans[0]["planId"] == mainId);
      CHECK(firstPlan(migrated, studentId) && (*firstPlan(migrated, studentId))["courses"].size() == 2);
      int copy = migrated.createPlan(studentId, "Copy", std::nullopt, mainId)["planId"].get<int>();
      migrated.deletePlan(studentId, copy);  // still deletes the copy's courses
      int next = migrated.createPlan(studentId, "Next", std::nullopt, std::nullopt)["planId"].get<int>();
      CHECK(next > copy);
    }
    CHECK(count("SELECT COUNT(*) FROM sqlite_master WHERE name = 'degree_plan' AND sql LIKE '%AUTOINCREMENT%'") == 1);
    CHECK(count("SELECT COUNT(*) FROM plan_course") == 2);
    CHECK(count("SELECT COUNT(*) FROM pragma_foreign_key_list('plan_course') WHERE \"table\" = 'degree_plan'") == 1);
    {
      Database again(path.string());  // a second start keeps everything
      CHECK(again.plans(studentId).size() == 2);
      CHECK((*firstPlan(again, studentId))["courses"].size() == 2);
    }
    std::filesystem::remove(path);
  }

  // A quarter ends on Dec 15 (Fall), Mar 25 (Winter) or Jun 15 (Spring) of its school year,
  // and can be confirmed from that day on.
  {
    Database dates(":memory:");
    dates.seed(DEFAULT_DATA_DIR);
    int studentId = dates.createStudent("sam@scu.edu", auth::hashPassword("correct horse"), 2025);
    int planId = firstPlanId(dates, studentId);
    auto canConfirm = [&](int quarter, Date today) {
      try {
        dates.confirmQuarters(studentId, planId, quarter, today);
        return true;
      } catch (const BadRequest&) {
        return false;
      }
    };
    CHECK(!canConfirm(0, {2025, 12, 14}));
    CHECK(canConfirm(0, {2025, 12, 15}));  // Year 1 Fall: Fall 2025
    CHECK(!canConfirm(1, {2026, 3, 24}));
    CHECK(canConfirm(1, {2026, 3, 25}));  // Year 1 Winter: Winter 2026
    CHECK(!canConfirm(2, {2026, 6, 14}));
    CHECK(canConfirm(2, {2026, 6, 15}));  // Year 1 Spring
    CHECK(!canConfirm(3, {2026, 6, 16}));  // Year 2 Fall hasn't started
    CHECK(canConfirm(3, {2026, 12, 15}));
    CHECK(!canConfirm(11, {2029, 6, 14}));
    CHECK(canConfirm(11, {2029, 6, 15}));  // Year 4 Spring: Spring 2029
    CHECK(dates.confirmedThrough(studentId) == 11);
    CHECK(!canConfirm(5, {2026, 1, 1}));  // a 400 leaves the last confirmation as it was
    CHECK(dates.confirmedThrough(studentId) == 11);
    CHECK(canConfirm(2, {2030, 1, 1}));  // confirming an earlier quarter lowers it
    CHECK(dates.confirmedThrough(studentId) == 2);
  }

  if (failures == 0) std::cout << "All API tests passed\n";
  return failures == 0 ? 0 : 1;
}
