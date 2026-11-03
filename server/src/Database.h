#pragma once

#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

struct sqlite3;

// Thrown when a request has bad data (the routes turn it into a 400).
struct BadRequest : std::runtime_error {
  using std::runtime_error::runtime_error;
};

struct PlanRow {
  std::string code;
  int quarter;
  std::string status;  // "planned" or "completed"
};

// Owns the SQLite connection. Every public method locks a mutex, because
// httplib handles requests on several threads.
class Database {
 public:
  // path can be ":memory:" for tests.
  explicit Database(const std::string& path);
  ~Database();
  Database(const Database&) = delete;
  Database& operator=(const Database&) = delete;

  // Loads courses.json and requirements.json from dataDir. Run on every start so the
  // database always matches the files the frontend checks the plan against.
  void seed(const std::string& dataDir);

  nlohmann::json courses();
  nlohmann::json requirements();
  // std::nullopt if the plan has never been saved.
  std::optional<nlohmann::json> plan(int planId);
  // Replaces every course in the plan and returns the new last-saved time.
  std::string savePlan(int planId, const std::vector<PlanRow>& rows);

 private:
  void exec(const std::string& sql);
  void createTables();

  sqlite3* db_ = nullptr;
  std::mutex mutex_;
};
