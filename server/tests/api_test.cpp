// Darren Hu
// Starts the server on a free port with an in-memory database and calls every route in API.md.
#include <filesystem>
#include <iostream>
#include <thread>

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
  Database db(":memory:");
  db.seed(DEFAULT_DATA_DIR);

  httplib::Server server;
  registerRoutes(server, db);
  int port = server.bind_to_any_port("127.0.0.1");
  std::thread thread([&] { server.listen_after_bind(); });
  server.wait_until_ready();

  httplib::Client client("127.0.0.1", port);
  auto put = [&](const std::string& path, const std::string& body) {
    return client.Put(path, body, "application/json");
  };
  auto status = [](const httplib::Result& res) { return res ? res->status : -1; };
  // A failed request or bad JSON gives an empty object, so the CHECKs fail instead of crashing.
  auto body = [](const httplib::Result& res) {
    json parsed = res ? json::parse(res->body, nullptr, false) : json::object();
    return parsed.is_discarded() ? json::object() : parsed;
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

  // GET /api/plans/1 before saving is a 404.
  {
    CHECK(status(client.Get("/api/plans/1")) == 404);
  }

  // PUT then GET returns the courses in the order they were added within each quarter.
  {
    auto res = put("/api/plans/1", R"({"courses": [
      {"code": "CSCI 60", "quarter": 1, "status": "planned"},
      {"code": "CSCI 10", "quarter": 0, "status": "completed"},
      {"code": "MATH 11", "quarter": 0, "status": "planned"}
    ]})");
    CHECK(status(res) == 200);
    json saved = body(res);
    CHECK(saved["planId"] == 1);
    CHECK(saved["lastSaved"].is_string());

    auto got = client.Get("/api/plans/1");
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
    put("/api/plans/1", R"({"courses": [{"code": "CSCI 61", "quarter": 3, "status": "planned"}]})");
    json plan = body(client.Get("/api/plans/1"));
    CHECK(plan["courses"].size() == 1);
    CHECK(plan["courses"][0]["code"] == "CSCI 61");

    CHECK(status(put("/api/plans/1", R"({"courses": []})")) == 200);
    CHECK(body(client.Get("/api/plans/1"))["courses"].empty());
  }

  // Bad bodies are 400s, and a rejected save doesn't change the plan.
  {
    put("/api/plans/1", R"({"courses": [{"code": "CSCI 10", "quarter": 0, "status": "planned"}]})");
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
      auto res = put("/api/plans/1", bad_body);
      if (status(res) != 400) std::cerr << "Expected 400 for: " << bad_body << "\n";
      CHECK(status(res) == 400);
    }
    json plan = body(client.Get("/api/plans/1"));
    CHECK(plan["courses"].size() == 1);
    for (const char* id : {"abc", "0", "-1", "1.5"}) {
      CHECK(status(client.Get(std::string("/api/plans/") + id)) == 400);
    }
  }

  // A quarter can have at most 18 units, the same limit as the app.
  {
    auto res = put("/api/plans/1", R"({"courses": [
      {"code": "CSCI 10", "quarter": 0, "status": "planned"},
      {"code": "CSCI 60", "quarter": 0, "status": "planned"},
      {"code": "MATH 11", "quarter": 0, "status": "planned"},
      {"code": "MATH 12", "quarter": 0, "status": "planned"},
      {"code": "MATH 13", "quarter": 1, "status": "planned"}
    ]})");
    CHECK(status(res) == 200);  // exactly 18 units in Year 1 Fall

    res = put("/api/plans/1", R"({"courses": [
      {"code": "CSCI 10", "quarter": 0, "status": "planned"},
      {"code": "CSCI 60", "quarter": 0, "status": "planned"},
      {"code": "MATH 11", "quarter": 0, "status": "planned"},
      {"code": "MATH 12", "quarter": 0, "status": "planned"},
      {"code": "MATH 13", "quarter": 0, "status": "planned"}
    ]})");
    CHECK(status(res) == 400);
    CHECK(body(res)["error"] == "Year 1 Fall can't have more than 18 units");
    CHECK(body(client.Get("/api/plans/1"))["courses"].size() == 5);  // unchanged
  }

  // Plans are separate: saving plan 2 doesn't touch plan 1.
  {
    put("/api/plans/2", R"({"courses": [{"code": "CHEM 11", "quarter": 5, "status": "planned"}]})");
    CHECK(body(client.Get("/api/plans/2"))["courses"].size() == 1);
    CHECK(body(client.Get("/api/plans/1"))["courses"].size() == 5);
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
    json plan = body(client.Get("/api/plans/1"));
    CHECK(plan["courses"].size() == 5);
  }

  server.stop();
  thread.join();

  // A plan saved to a database file is still there after the server restarts.
  {
    auto path = std::filesystem::temp_directory_path() / "degree_planner_api_test.db";
    std::filesystem::remove(path);
    {
      Database first(path.string());
      first.seed(DEFAULT_DATA_DIR);
      first.savePlan(1, {{"CSCI 10", 0, "completed"}, {"CSCI 60", 1, "planned"}});
    }
    Database second(path.string());
    second.seed(DEFAULT_DATA_DIR);
    auto plan = second.plan(1);
    CHECK(plan && (*plan)["courses"] == json::parse(R"([
      {"code": "CSCI 10", "quarter": 0, "status": "completed"},
      {"code": "CSCI 60", "quarter": 1, "status": "planned"}
    ])"));
    std::filesystem::remove(path);
  }

  if (failures == 0) std::cout << "All API tests passed\n";
  return failures == 0 ? 0 : 1;
}
