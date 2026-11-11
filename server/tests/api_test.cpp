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
    CHECK(courses.size() == 33);
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
    CHECK(reqs.size() == 7);
    CHECK(reqs[0]["requirementId"] == 1);
    CHECK(reqs[0]["courses"] == json::parse(R"(["CSCI 10", "CSCI 60", "CSCI 61", "CSCI 62"])"));
    CHECK(reqs[0]["count"] == 4);
    CHECK(reqs[2]["count"] == 1);
    CHECK(reqs[6]["count"] == 2);
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

  // Without a valid session, /api/me and the plan routes are 401s.
  {
    CHECK(status(client.Get("/api/me")) == 401);
    CHECK(status(client.Get("/api/me/plan")) == 401);
    CHECK(status(client.Put("/api/me/plan", R"({"courses": []})", "application/json")) == 401);
    CHECK(status(client.Get("/api/me", {{"Cookie", "session=not-a-real-token"}})) == 401);
    CHECK(status(client.Get("/api/me", {{"Cookie", "session="}})) == 401);
  }

  // An expired session is a 401, even though the token exists.
  {
    int studentId = db.findStudentByEmail("ana@scu.edu")->studentId;
    std::string token = auth::newSessionToken();
    db.createSession(token, studentId, -1);
    CHECK(status(client.Get("/api/me", {{"Cookie", "session=" + token}})) == 401);
    CHECK(status(client.Get("/api/me/plan", {{"Cookie", "session=" + token}})) == 401);

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
  auto put = [&](const std::string& path, const std::string& body) {
    return alice->Put(path, body, "application/json");
  };

  // GET /api/me/plan before saving is a 404.
  {
    CHECK(status(alice->Get("/api/me/plan")) == 404);
  }

  // PUT then GET returns the courses in the order they were added within each quarter.
  {
    auto res = put("/api/me/plan", R"({"courses": [
      {"code": "CSCI 60", "quarter": 1, "status": "planned"},
      {"code": "CSCI 10", "quarter": 0, "status": "completed"},
      {"code": "MATH 11", "quarter": 0, "status": "planned"}
    ]})");
    CHECK(status(res) == 200);
    json saved = body(res);
    CHECK(saved["planId"].is_number_integer());
    CHECK(saved["lastSaved"].is_string());

    auto got = alice->Get("/api/me/plan");
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
    put("/api/me/plan", R"({"courses": [{"code": "CSCI 61", "quarter": 3, "status": "planned"}]})");
    json plan = body(alice->Get("/api/me/plan"));
    CHECK(plan["courses"].size() == 1);
    CHECK(plan["courses"][0]["code"] == "CSCI 61");

    CHECK(status(put("/api/me/plan", R"({"courses": []})")) == 200);
    CHECK(body(alice->Get("/api/me/plan"))["courses"].empty());
  }

  // Bad bodies are 400s, and a rejected save doesn't change the plan.
  {
    put("/api/me/plan", R"({"courses": [{"code": "CSCI 10", "quarter": 0, "status": "planned"}]})");
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
    };
    for (const char* bad_body : bad) {
      auto res = put("/api/me/plan", bad_body);
      if (status(res) != 400) std::cerr << "Expected 400 for: " << bad_body << "\n";
      CHECK(status(res) == 400);
    }
    // A valid body that isn't sent as JSON.
    CHECK(status(alice->Put("/api/me/plan", R"({"courses": []})", "text/plain")) == 400);
    json plan = body(alice->Get("/api/me/plan"));
    CHECK(plan["courses"].size() == 1);
  }

  // A quarter can have at most 18 units, the same limit as the app.
  {
    auto res = put("/api/me/plan", R"({"courses": [
      {"code": "CSCI 10", "quarter": 0, "status": "planned"},
      {"code": "CSCI 60", "quarter": 0, "status": "planned"},
      {"code": "MATH 11", "quarter": 0, "status": "planned"},
      {"code": "MATH 12", "quarter": 0, "status": "planned"},
      {"code": "MATH 13", "quarter": 1, "status": "planned"}
    ]})");
    CHECK(status(res) == 200);  // exactly 18 units in Year 1 Fall

    res = put("/api/me/plan", R"({"courses": [
      {"code": "CSCI 10", "quarter": 0, "status": "planned"},
      {"code": "CSCI 60", "quarter": 0, "status": "planned"},
      {"code": "MATH 11", "quarter": 0, "status": "planned"},
      {"code": "MATH 12", "quarter": 0, "status": "planned"},
      {"code": "MATH 13", "quarter": 0, "status": "planned"}
    ]})");
    CHECK(status(res) == 400);
    CHECK(body(res)["error"] == "Year 1 Fall can't have more than 18 units");
    CHECK(body(alice->Get("/api/me/plan"))["courses"].size() == 5);  // unchanged
  }

  // One student can't see or change another's plan.
  {
    auto bob = newStudent("bob@scu.edu");
    CHECK(status(bob->Get("/api/me/plan")) == 404);  // Bob gets his own empty plan, not Alice's

    auto res = bob->Put("/api/me/plan", R"({"courses": [{"code": "CHEM 11", "quarter": 5, "status": "planned"}]})",
                        "application/json");
    CHECK(status(res) == 200);
    CHECK(body(res)["planId"] != body(alice->Get("/api/me/plan"))["planId"]);
    CHECK(body(bob->Get("/api/me/plan"))["courses"].size() == 1);
    CHECK(body(alice->Get("/api/me/plan"))["courses"].size() == 5);  // Alice's plan is unchanged

    // The old routes that took a plan id from the URL are gone.
    CHECK(status(bob->Get("/api/plans/1")) == 404);
    CHECK(status(bob->Put("/api/plans/1", R"({"courses": []})", "application/json")) == 404);
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
    json plan = body(alice->Get("/api/me/plan"));
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
      first.savePlan(studentId, {{"CSCI 10", 0, "completed"}, {"CSCI 60", 1, "planned"}});
    }
    Database second(path.string());
    second.seed(DEFAULT_DATA_DIR);
    // The account, its session and its plan all survive.
    auto login = second.findStudentByEmail("carol@scu.edu");
    CHECK(login && auth::verifyPassword("correct horse", login->passwordHash));
    CHECK(second.studentForSession("carols-token") == login->studentId);
    auto plan = second.plan(login->studentId);
    CHECK(plan && (*plan)["courses"] == json::parse(R"([
      {"code": "CSCI 10", "quarter": 0, "status": "completed"},
      {"code": "CSCI 60", "quarter": 1, "status": "planned"}
    ])"));
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
      CHECK(!migrated.plan(studentId));  // the ownerless plan 1 isn't anyone's
      migrated.savePlan(studentId, {{"CSCI 10", 0, "planned"}});
      auto plan = migrated.plan(studentId);
      CHECK(plan && (*plan)["courses"].size() == 1);
    }
    std::filesystem::remove(path);
  }

  if (failures == 0) std::cout << "All API tests passed\n";
  return failures == 0 ? 0 : 1;
}
