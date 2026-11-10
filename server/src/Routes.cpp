#include "Routes.h"

#include <cstdint>
#include <iostream>

using nlohmann::json;

namespace {

void sendJson(httplib::Response& res, const json& body, int status = 200) {
  res.status = status;
  res.set_content(body.dump(), "application/json");
}

void sendError(httplib::Response& res, int status, const std::string& message) {
  sendJson(res, {{"error", message}}, status);
}

// Plan ids are positive integers. Returns false (and sends a 400) otherwise.
bool parsePlanId(const httplib::Request& req, httplib::Response& res, int& planId) {
  const std::string& raw = req.path_params.at("planId");
  try {
    size_t used = 0;
    planId = std::stoi(raw, &used);
    if (used == raw.size() && planId > 0) return true;
  } catch (...) {
  }
  sendError(res, 400, "Plan id must be a positive integer");
  return false;
}

// Checks the PUT body shape: { "courses": [ { code, quarter 0-11, status } ] }.
std::vector<PlanRow> parsePlanBody(const std::string& body) {
  json parsed = json::parse(body, nullptr, false);
  if (parsed.is_discarded() || !parsed.is_object()) throw BadRequest("Body must be a JSON object");
  if (!parsed.contains("courses") || !parsed["courses"].is_array()) {
    throw BadRequest("Body must have a \"courses\" array");
  }
  std::vector<PlanRow> rows;
  for (const auto& c : parsed["courses"]) {
    if (!c.is_object()) throw BadRequest("Each course must be an object");
    if (!c.contains("code") || !c["code"].is_string()) throw BadRequest("Each course needs a string \"code\"");
    if (!c.contains("quarter") || !c["quarter"].is_number_integer()) {
      throw BadRequest("Each course needs an integer \"quarter\"");
    }
    if (!c.contains("status") || !c["status"].is_string()) throw BadRequest("Each course needs a string \"status\"");
    // Check the range before narrowing to int, so 4294967296 isn't read as 0.
    auto quarter = c["quarter"].get<std::int64_t>();
    if (quarter < 0 || quarter > 11) throw BadRequest("\"quarter\" must be 0 to 11");
    PlanRow row{c["code"], static_cast<int>(quarter), c["status"]};
    if (row.status != "planned" && row.status != "completed") {
      throw BadRequest("\"status\" must be \"planned\" or \"completed\"");
    }
    rows.push_back(row);
  }
  return rows;
}

}  // namespace

void registerRoutes(httplib::Server& server, Database& db) {
  server.Get("/api/courses", [&db](const httplib::Request&, httplib::Response& res) {
    sendJson(res, db.courses());
  });

  server.Get("/api/requirements", [&db](const httplib::Request&, httplib::Response& res) {
    sendJson(res, db.requirements());
  });

  server.Get("/api/plans/:planId", [&db](const httplib::Request& req, httplib::Response& res) {
    int planId;
    if (!parsePlanId(req, res, planId)) return;
    auto plan = db.plan(planId);
    if (!plan) return sendError(res, 404, "Plan not found");
    sendJson(res, *plan);
  });

  server.Put("/api/plans/:planId", [&db](const httplib::Request& req, httplib::Response& res) {
    int planId;
    if (!parsePlanId(req, res, planId)) return;
    try {
      std::string lastSaved = db.savePlan(planId, parsePlanBody(req.body));
      sendJson(res, {{"planId", planId}, {"lastSaved", lastSaved}});
    } catch (const BadRequest& e) {
      sendError(res, 400, e.what());
    }
  });

  // Anything that throws (e.g. a database error) becomes a 500 instead of crashing the server.
  server.set_exception_handler([](const httplib::Request& req, httplib::Response& res, std::exception_ptr ep) {
    std::string message = "Internal server error";
    try {
      std::rethrow_exception(ep);
    } catch (const std::exception& e) {
      std::cerr << req.method << " " << req.path << ": " << e.what() << "\n";
    } catch (...) {
    }
    sendError(res, 500, message);
  });

  server.set_error_handler([](const httplib::Request&, httplib::Response& res) {
    if (res.body.empty()) sendError(res, res.status, res.status == 404 ? "Not found" : "Error");
  });
}
