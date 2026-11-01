// Darren Hu
// Starts the server on a free port with an in-memory database and calls every route in API.md.
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

  // GET /api/courses
  {
    auto res = client.Get("/api/courses");
    CHECK(res && res->status == 200);
    json courses = json::parse(res->body);
    CHECK(courses.size() == 28);
    json csci10, csci61;
    for (auto& c : courses) {
      if (c["code"] == "CSCI 10") csci10 = c;
      if (c["code"] == "CSCI 61") csci61 = c;
    }
    CHECK(csci10["prerequisites"] == json::array());
    CHECK(csci61["units"] == 4);
    CHECK(csci61["prerequisites"] == json::parse(R"([["CSCI 60"]])"));
    CHECK(csci61["title"] == "Data Structures");
  }

  // GET /api/requirements: count defaults to every listed course.
  {
    auto res = client.Get("/api/requirements");
    CHECK(res && res->status == 200);
    json reqs = json::parse(res->body);
    CHECK(reqs.size() == 7);
    CHECK(reqs[0]["requirementId"] == 1);
    CHECK(reqs[0]["courses"] == json::parse(R"(["CSCI 10", "CSCI 60", "CSCI 61", "CSCI 62"])"));
    CHECK(reqs[0]["count"] == 4);
    CHECK(reqs[2]["count"] == 1);
  }

  // GET /api/plans/1 before saving is a 404.
  {
    auto res = client.Get("/api/plans/1");
    CHECK(res && res->status == 404);
  }

  // PUT then GET returns the courses in the order they were added within each quarter.
  {
    auto res = put("/api/plans/1", R"({"courses": [
      {"code": "CSCI 60", "quarter": 1, "status": "planned"},
      {"code": "CSCI 10", "quarter": 0, "status": "completed"},
      {"code": "MATH 11", "quarter": 0, "status": "planned"}
    ]})");
    CHECK(res && res->status == 200);
    json saved = json::parse(res->body);
    CHECK(saved["planId"] == 1);
    CHECK(saved["lastSaved"].is_string());

    auto got = client.Get("/api/plans/1");
    CHECK(got && got->status == 200);
    json plan = json::parse(got->body);
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
    json plan = json::parse(client.Get("/api/plans/1")->body);
    CHECK(plan["courses"].size() == 1);
    CHECK(plan["courses"][0]["code"] == "CSCI 61");

    CHECK(put("/api/plans/1", R"({"courses": []})")->status == 200);
    CHECK(json::parse(client.Get("/api/plans/1")->body)["courses"].empty());
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
        R"({"courses": [{"code": "CSCI 10", "quarter": 0, "status": "done"}]})",
        R"({"courses": [{"code": "CSCI 10", "quarter": "0", "status": "planned"}]})",
        R"({"courses": [{"code": "FAKE 1", "quarter": 0, "status": "planned"}]})",
        R"({"courses": [{"code": "CSCI 10", "quarter": 0, "status": "planned"},
                        {"code": "CSCI 10", "quarter": 1, "status": "planned"}]})",
    };
    for (const char* body : bad) {
      auto res = put("/api/plans/1", body);
      if (!(res && res->status == 400)) std::cerr << "Expected 400 for: " << body << "\n";
      CHECK(res && res->status == 400);
    }
    json plan = json::parse(client.Get("/api/plans/1")->body);
    CHECK(plan["courses"].size() == 1);
    CHECK(client.Get("/api/plans/abc")->status == 400);
  }

  // Reseeding keeps saved plans.
  {
    db.seed(DEFAULT_DATA_DIR);
    json plan = json::parse(client.Get("/api/plans/1")->body);
    CHECK(plan["courses"].size() == 1);
  }

  server.stop();
  thread.join();
  if (failures == 0) std::cout << "All API tests passed\n";
  return failures == 0 ? 0 : 1;
}
