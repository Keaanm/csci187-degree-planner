#include "Database.h"

#include <chrono>
#include <ctime>
#include <fstream>
#include <map>
#include <set>

#include <sqlite3.h>

using nlohmann::json;

namespace {

// RAII wrapper around a prepared statement.
class Statement {
 public:
  Statement(sqlite3* db, const std::string& sql) : db_(db) {
    if (sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt_, nullptr) != SQLITE_OK) {
      throw std::runtime_error(std::string("SQL error: ") + sqlite3_errmsg(db));
    }
  }
  ~Statement() { sqlite3_finalize(stmt_); }
  Statement(const Statement&) = delete;
  Statement& operator=(const Statement&) = delete;

  Statement& bind(int i, int value) {
    sqlite3_bind_int(stmt_, i, value);
    return *this;
  }
  Statement& bind(int i, const std::string& value) {
    sqlite3_bind_text(stmt_, i, value.c_str(), -1, SQLITE_TRANSIENT);
    return *this;
  }

  // True while there is a row to read.
  bool step() {
    int rc = sqlite3_step(stmt_);
    if (rc == SQLITE_ROW) return true;
    if (rc == SQLITE_DONE) return false;
    throw std::runtime_error(std::string("SQL error: ") + sqlite3_errmsg(db_));
  }
  // For INSERT/UPDATE/DELETE: run once, then reset so the statement can be reused.
  void run() {
    step();
    sqlite3_reset(stmt_);
    sqlite3_clear_bindings(stmt_);
  }

  int intAt(int col) { return sqlite3_column_int(stmt_, col); }
  std::string textAt(int col) {
    auto text = sqlite3_column_text(stmt_, col);
    return text ? reinterpret_cast<const char*>(text) : "";
  }
  bool isNull(int col) { return sqlite3_column_type(stmt_, col) == SQLITE_NULL; }

 private:
  sqlite3* db_;
  sqlite3_stmt* stmt_ = nullptr;
};

json readJsonFile(const std::string& path) {
  std::ifstream in(path);
  if (!in) throw std::runtime_error("Can't open " + path);
  return json::parse(in);
}

// ISO 8601 in UTC with milliseconds, like JavaScript's toISOString().
std::string nowIso() {
  using namespace std::chrono;
  auto now = system_clock::now();
  auto ms = duration_cast<milliseconds>(now.time_since_epoch()).count() % 1000;
  std::time_t t = system_clock::to_time_t(now);
  std::tm utc{};
#ifdef _WIN32
  gmtime_s(&utc, &t);
#else
  gmtime_r(&t, &utc);
#endif
  char buf[32];
  std::strftime(buf, sizeof buf, "%Y-%m-%dT%H:%M:%S", &utc);
  char out[40];
  std::snprintf(out, sizeof out, "%s.%03dZ", buf, static_cast<int>(ms));
  return out;
}

}  // namespace

Database::Database(const std::string& path) {
  if (sqlite3_open(path.c_str(), &db_) != SQLITE_OK) {
    std::string message = sqlite3_errmsg(db_);
    sqlite3_close(db_);
    throw std::runtime_error("Can't open database " + path + ": " + message);
  }
  exec("PRAGMA foreign_keys = ON");
  createTables();
}

Database::~Database() { sqlite3_close(db_); }

void Database::exec(const std::string& sql) {
  char* error = nullptr;
  if (sqlite3_exec(db_, sql.c_str(), nullptr, nullptr, &error) != SQLITE_OK) {
    std::string message = error ? error : "unknown error";
    sqlite3_free(error);
    throw std::runtime_error("SQL error: " + message);
  }
}

// Tables from the ER diagram (see API.md).
void Database::createTables() {
  exec(R"sql(
    CREATE TABLE IF NOT EXISTS course (
      course_id   INTEGER PRIMARY KEY,
      code        TEXT NOT NULL UNIQUE,
      title       TEXT NOT NULL,
      units       INTEGER NOT NULL,
      description TEXT NOT NULL
    );
    -- prerequisite_code is a code, not a course_id, because some prerequisites
    -- (e.g. CSEN 79, CSEN 12) are alternatives that aren't in the offered list.
    CREATE TABLE IF NOT EXISTS course_prerequisite (
      course_id         INTEGER NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
      prerequisite_code TEXT NOT NULL,
      prereq_group      INTEGER NOT NULL,
      PRIMARY KEY (course_id, prerequisite_code, prereq_group)
    );
    CREATE TABLE IF NOT EXISTS degree_requirement (
      requirement_id INTEGER PRIMARY KEY,
      description    TEXT NOT NULL,
      count          INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS course_requirement (
      course_id      INTEGER NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
      requirement_id INTEGER NOT NULL REFERENCES degree_requirement(requirement_id) ON DELETE CASCADE,
      position       INTEGER NOT NULL,
      PRIMARY KEY (course_id, requirement_id)
    );
    CREATE TABLE IF NOT EXISTS degree_plan (
      plan_id    INTEGER PRIMARY KEY,
      last_saved TEXT NOT NULL
    );
    -- position keeps the order courses were added within each quarter.
    CREATE TABLE IF NOT EXISTS plan_course (
      plan_id   INTEGER NOT NULL REFERENCES degree_plan(plan_id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
      quarter   INTEGER NOT NULL CHECK (quarter BETWEEN 0 AND 11),
      status    TEXT NOT NULL CHECK (status IN ('planned', 'completed')),
      position  INTEGER NOT NULL,
      PRIMARY KEY (plan_id, course_id)
    );
  )sql");
}

void Database::seed(const std::string& dataDir) {
  json courseData = readJsonFile(dataDir + "/courses.json");
  json requirementData = readJsonFile(dataDir + "/requirements.json");

  std::lock_guard<std::mutex> lock(mutex_);
  exec("BEGIN");
  try {
    // Upsert by code so course_ids (and the saved plans that use them) survive a reseed.
    Statement upsert(db_, R"sql(
      INSERT INTO course (code, title, units, description) VALUES (?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        title = excluded.title, units = excluded.units, description = excluded.description)sql");
    std::set<std::string> offered;
    for (const auto& c : courseData) {
      std::string code = c.at("code");
      offered.insert(code);
      upsert.bind(1, code).bind(2, c.at("title").get<std::string>())
          .bind(3, c.at("units").get<int>()).bind(4, c.at("description").get<std::string>());
      upsert.run();
    }

    // Courses dropped from the list are removed (and so are plan rows that used them).
    std::vector<std::string> dropped;
    {
      Statement all(db_, "SELECT code FROM course");
      while (all.step()) {
        if (!offered.count(all.textAt(0))) dropped.push_back(all.textAt(0));
      }
    }
    Statement drop(db_, "DELETE FROM course WHERE code = ?");
    for (const auto& code : dropped) {
      drop.bind(1, code);
      drop.run();
    }

    std::map<std::string, int> ids;
    {
      Statement all(db_, "SELECT code, course_id FROM course");
      while (all.step()) ids[all.textAt(0)] = all.intAt(1);
    }

    exec("DELETE FROM course_prerequisite");
    Statement prereq(db_,
        "INSERT OR IGNORE INTO course_prerequisite (course_id, prerequisite_code, prereq_group) VALUES (?, ?, ?)");
    for (const auto& c : courseData) {
      int courseId = ids.at(c.at("code").get<std::string>());
      int group = 0;
      for (const auto& alternatives : c.at("prerequisites")) {
        for (const auto& code : alternatives) {
          prereq.bind(1, courseId).bind(2, code.get<std::string>()).bind(3, group);
          prereq.run();
        }
        ++group;
      }
    }

    // Requirement ids are their position in requirements.json, starting at 1.
    exec("DELETE FROM course_requirement");
    exec("DELETE FROM degree_requirement");
    Statement requirement(db_,
        "INSERT INTO degree_requirement (requirement_id, description, count) VALUES (?, ?, ?)");
    Statement satisfies(db_,
        "INSERT OR IGNORE INTO course_requirement (course_id, requirement_id, position) VALUES (?, ?, ?)");
    int requirementId = 1;
    for (const auto& r : requirementData) {
      const auto& courses = r.at("courses");
      int count = r.contains("count") ? r.at("count").get<int>() : static_cast<int>(courses.size());
      requirement.bind(1, requirementId).bind(2, r.at("description").get<std::string>()).bind(3, count);
      requirement.run();
      int position = 0;
      for (const auto& code : courses) {
        auto it = ids.find(code.get<std::string>());
        if (it == ids.end()) {
          throw std::runtime_error("requirements.json lists " + code.get<std::string>() +
                                   ", which isn't in courses.json");
        }
        satisfies.bind(1, it->second).bind(2, requirementId).bind(3, position++);
        satisfies.run();
      }
      ++requirementId;
    }
    exec("COMMIT");
  } catch (...) {
    exec("ROLLBACK");
    throw;
  }
}

json Database::courses() {
  std::lock_guard<std::mutex> lock(mutex_);
  json result = json::array();
  std::map<int, size_t> index;  // course_id -> position in result
  Statement all(db_, "SELECT course_id, code, title, description, units FROM course ORDER BY course_id");
  while (all.step()) {
    index[all.intAt(0)] = result.size();
    result.push_back({{"code", all.textAt(1)},
                      {"title", all.textAt(2)},
                      {"description", all.textAt(3)},
                      {"units", all.intAt(4)},
                      {"prerequisites", json::array()}});
  }
  Statement prereqs(db_, R"sql(
    SELECT course_id, prereq_group, prerequisite_code FROM course_prerequisite
    ORDER BY course_id, prereq_group, rowid)sql");
  while (prereqs.step()) {
    auto& groups = result[index.at(prereqs.intAt(0))]["prerequisites"];
    size_t group = static_cast<size_t>(prereqs.intAt(1));
    while (groups.size() <= group) groups.push_back(json::array());
    groups[group].push_back(prereqs.textAt(2));
  }
  return result;
}

json Database::requirements() {
  std::lock_guard<std::mutex> lock(mutex_);
  json result = json::array();
  Statement all(db_, R"sql(
    SELECT r.requirement_id, r.description, r.count, c.code
    FROM degree_requirement r
    LEFT JOIN course_requirement cr ON cr.requirement_id = r.requirement_id
    LEFT JOIN course c ON c.course_id = cr.course_id
    ORDER BY r.requirement_id, cr.position)sql");
  int current = -1;
  while (all.step()) {
    if (all.intAt(0) != current) {
      current = all.intAt(0);
      result.push_back({{"requirementId", current},
                        {"description", all.textAt(1)},
                        {"count", all.intAt(2)},
                        {"courses", json::array()}});
    }
    if (!all.isNull(3)) result.back()["courses"].push_back(all.textAt(3));
  }
  return result;
}

std::optional<json> Database::plan(int planId) {
  std::lock_guard<std::mutex> lock(mutex_);
  Statement find(db_, "SELECT last_saved FROM degree_plan WHERE plan_id = ?");
  find.bind(1, planId);
  if (!find.step()) return std::nullopt;
  json result = {{"planId", planId}, {"lastSaved", find.textAt(0)}, {"courses", json::array()}};

  Statement rows(db_, R"sql(
    SELECT c.code, pc.quarter, pc.status FROM plan_course pc
    JOIN course c ON c.course_id = pc.course_id
    WHERE pc.plan_id = ? ORDER BY pc.quarter, pc.position)sql");
  rows.bind(1, planId);
  while (rows.step()) {
    result["courses"].push_back(
        {{"code", rows.textAt(0)}, {"quarter", rows.intAt(1)}, {"status", rows.textAt(2)}});
  }
  return result;
}

std::string Database::savePlan(int planId, const std::vector<PlanRow>& rows) {
  std::lock_guard<std::mutex> lock(mutex_);

  // Check every row before writing anything.
  std::vector<int> courseIds;
  std::set<std::string> seen;
  Statement findCourse(db_, "SELECT course_id FROM course WHERE code = ?");
  for (const auto& row : rows) {
    if (!seen.insert(row.code).second) throw BadRequest(row.code + " is in the plan more than once");
    findCourse.bind(1, row.code);
    if (!findCourse.step()) throw BadRequest(row.code + " is not an offered course");
    courseIds.push_back(findCourse.intAt(0));
    findCourse.run();  // reset for the next row
  }

  std::string lastSaved = nowIso();
  exec("BEGIN");
  try {
    Statement upsert(db_, R"sql(
      INSERT INTO degree_plan (plan_id, last_saved) VALUES (?, ?)
      ON CONFLICT(plan_id) DO UPDATE SET last_saved = excluded.last_saved)sql");
    upsert.bind(1, planId).bind(2, lastSaved);
    upsert.run();

    Statement clear(db_, "DELETE FROM plan_course WHERE plan_id = ?");
    clear.bind(1, planId);
    clear.run();

    Statement insert(db_,
        "INSERT INTO plan_course (plan_id, course_id, quarter, status, position) VALUES (?, ?, ?, ?, ?)");
    for (size_t i = 0; i < rows.size(); ++i) {
      insert.bind(1, planId).bind(2, courseIds[i]).bind(3, rows[i].quarter)
          .bind(4, rows[i].status).bind(5, static_cast<int>(i));
      insert.run();
    }
    exec("COMMIT");
  } catch (...) {
    exec("ROLLBACK");
    throw;
  }
  return lastSaved;
}
