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

// Thrown when a plan id isn't one of the logged-in student's plans (the routes send a 404).
struct NotFound : std::runtime_error {
  using std::runtime_error::runtime_error;
};

// What PATCH /api/me/plans/:planId changes. A field left empty stays as it is.
struct PlanChanges {
  std::optional<std::string> name;
  bool changeProgram = false;
  std::optional<int> programId;  // used when changeProgram; empty means no emphasis
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

// A calendar day in the server's time zone, for deciding which quarters have ended.
struct Date {
  int year;
  int month;  // 1 to 12
  int day;
};

// One unit of other credit on a plan: AP, transfer, study abroad, or Core/elective units
// that aren't courses in our catalog.
struct PlanCredit {
  std::string kind;  // "core", "elective", "ap", "transfer" or "abroad"
  std::string description;
  int units;  // 1 to 60
  std::optional<int> requirementId;  // the requirement it counts toward, if any
};

struct PlanRow {
  std::string code;
  int quarter;
  std::string status;  // "planned", "completed" or "failed"
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
  // Replaces every course in one of the student's plans. Throws NotFound if it isn't theirs.
  // With credits, also replaces all of the plan's other credit; without, leaves it as it is.
  // Throws BadRequest for a credit whose requirementId isn't a requirement.
  SavedPlan savePlan(int studentId, int planId, const std::vector<PlanRow>& rows,
                     const std::optional<std::vector<PlanCredit>>& credits = std::nullopt);

  // Several plans. Every method throws NotFound for a plan id that isn't the student's,
  // and BadRequest for a program id that isn't an emphasis.
  // The student's plans, oldest first: { planId, name, programId, lastSaved, shared }.
  nlohmann::json plans(int studentId);
  // A new plan, empty or with copyFrom's courses and other credit. Returns it in the same
  // shape as plans().
  nlohmann::json createPlan(int studentId, const std::string& name, std::optional<int> programId,
                            std::optional<int> copyFrom);
  nlohmann::json updatePlan(int studentId, int planId, const PlanChanges& changes);
  // Throws BadRequest for the student's only plan.
  void deletePlan(int studentId, int planId);
  // { planId, lastSaved, courses, credits }, or std::nullopt if it isn't the student's.
  std::optional<nlohmann::json> planById(int studentId, int planId);

  // email should already be trimmed and lowercased. Throws EmailTaken. Returns the new id.
  // Also makes the student's first plan, an empty "Main plan".
  int createStudent(const std::string& email, const std::string& passwordHash, int startYear);
  std::optional<StudentLogin> findStudentByEmail(const std::string& email);
  // { "email", "startYear" }, or std::nullopt for an unknown id.
  std::optional<nlohmann::json> student(int studentId);

  // Finished quarters. The last quarter (0 to 11) whose results the student confirmed, or
  // std::nullopt if they haven't confirmed any.
  std::optional<int> confirmedThrough(int studentId);
  // Records that the student confirmed every quarter up to and including `quarter`, using
  // planId's courses and results, and copies those quarters into the student's other plans.
  // All or nothing. Throws NotFound if planId isn't the student's, and BadRequest if the
  // quarter hasn't ended by `today`, a course in a confirmed quarter is still "planned", or
  // another plan would then have a course again after passing it.
  void confirmQuarters(int studentId, int planId, int quarter, const Date& today);

  // A negative lifetime makes a session that has already expired (used by the tests).
  void createSession(const std::string& token, int studentId, int lifetimeSeconds);
  // The logged-in student, or std::nullopt if the token is unknown or expired.
  std::optional<int> studentForSession(const std::string& token);
  void deleteSession(const std::string& token);

 private:
  void exec(const std::string& sql);
  void createTables();
  void createPlanCourse(const std::string& table);
  bool hasColumn(const std::string& table, const std::string& column);

  void createProgramTable();
  void addStudentColumns();
  void createCreditTable();
  void addPlanColumns();
  void neverReusePlanIds();
  // Callers must hold mutex_.
  bool ownsPlan(int studentId, int planId);
  nlohmann::json planSummary(int planId);
  nlohmann::json planWithCourses(int planId);
  void checkEmphasis(std::optional<int> programId);

  sqlite3* db_ = nullptr;
  std::mutex mutex_;
};
