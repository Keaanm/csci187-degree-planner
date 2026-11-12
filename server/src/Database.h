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

// Thrown by createStudent when the email already has an account (the routes send a 409).
struct EmailTaken : std::runtime_error {
  using std::runtime_error::runtime_error;
};

// What login needs to check a password.
struct StudentLogin {
  int studentId;
  std::string passwordHash;
};

struct SavedPlan {
  int planId;
  std::string lastSaved;
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

  // Loads courses.json, requirements.json and programs.json from dataDir. Run on every start so the
  // database always matches the files the frontend checks the plan against.
  void seed(const std::string& dataDir);

  nlohmann::json courses();
  nlohmann::json requirements();
  // Every program (the major, its emphases, the University Core), by id.
  nlohmann::json programs();
  // The student's plan, or std::nullopt if they have never saved one.
  std::optional<nlohmann::json> plan(int studentId);
  // Replaces every course in the student's plan, creating the plan on the first save.
  SavedPlan savePlan(int studentId, const std::vector<PlanRow>& rows);

  // email should already be trimmed and lowercased. Throws EmailTaken. Returns the new id.
  int createStudent(const std::string& email, const std::string& passwordHash, int startYear);
  std::optional<StudentLogin> findStudentByEmail(const std::string& email);
  // { "email", "startYear" }, or std::nullopt for an unknown id.
  std::optional<nlohmann::json> student(int studentId);

  // A negative lifetime makes a session that has already expired (used by the tests).
  void createSession(const std::string& token, int studentId, int lifetimeSeconds);
  // The logged-in student, or std::nullopt if the token is unknown or expired.
  std::optional<int> studentForSession(const std::string& token);
  void deleteSession(const std::string& token);

 private:
  void exec(const std::string& sql);
  void createTables();
  bool hasColumn(const std::string& table, const std::string& column);
  // Callers must hold mutex_.
  std::optional<int> firstPlanId(int studentId);

  void createProgramTable();

  sqlite3* db_ = nullptr;
  std::mutex mutex_;
};
