#include "Database.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <ctime>
#include <fstream>
#include <map>
#include <set>
#include <tuple>

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
    // Pass the length, so a string with a NUL byte isn't cut short.
    sqlite3_bind_text(stmt_, i, value.c_str(), static_cast<int>(value.size()), SQLITE_TRANSIENT);
    return *this;
  }

  // True while there is a row to read.
  bool step() {
    int rc = sqlite3_step(stmt_);
    if (rc == SQLITE_ROW) return true;
    if (rc == SQLITE_DONE) return false;
    throw std::runtime_error(std::string("SQL error: ") + sqlite3_errmsg(db_));
  }
  // Clears the bindings and rewinds, so the statement can be run again.
  void reset() {
    sqlite3_reset(stmt_);
    sqlite3_clear_bindings(stmt_);
  }
  // For INSERT/UPDATE/DELETE: run once, then reset.
  void run() {
    step();
    reset();
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

// Same limit and quarter names as the frontend (src/DegreePlan.ts).
constexpr int kMaxUnitsPerQuarter = 18;

std::string quarterLabel(int quarter) {
  static const char* terms[] = {"Fall", "Winter", "Spring"};
  return "Year " + std::to_string(quarter / 3 + 1) + " " + terms[quarter % 3];
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

// A course can be in a plan more than once only if every attempt but the last is failed,
// and each attempt is in a later quarter than the one before. Rows can be in any order.
// (The frontend doesn't plan retakes yet; when it does, it should follow the same rule.)
void checkAttempts(const std::vector<PlanRow>& rows, const std::string& errorPrefix = "") {
  std::map<std::string, std::vector<const PlanRow*>> attempts;  // code -> its rows
  for (const auto& row : rows) attempts[row.code].push_back(&row);
  for (auto& [code, list] : attempts) {
    std::stable_sort(list.begin(), list.end(),
                     [](const PlanRow* a, const PlanRow* b) { return a->quarter < b->quarter; });
    for (size_t i = 1; i < list.size(); ++i) {
      if (list[i]->quarter == list[i - 1]->quarter) {
        throw BadRequest(errorPrefix + code + " is in " + quarterLabel(list[i]->quarter) + " more than once");
      }
      if (list[i - 1]->status != "failed") {
        throw BadRequest(errorPrefix + code +
                         " is in the plan more than once; only a failed attempt can be retaken");
      }
    }
  }
}

// The day a quarter ends, for a student who started in Fall of startYear: Dec 15 (Fall),
// Mar 25 (Winter) or Jun 15 (Spring) of its school year.
Date quarterEnd(int startYear, int quarter) {
  int fallYear = startYear + quarter / 3;
  switch (quarter % 3) {
    case 0: return {fallYear, 12, 15};
    case 1: return {fallYear + 1, 3, 25};
    default: return {fallYear + 1, 6, 15};
  }
}

// A quarter has ended from its last day on.
bool hasEnded(int startYear, int quarter, const Date& today) {
  Date end = quarterEnd(startYear, quarter);
  return std::tie(today.year, today.month, today.day) >= std::tie(end.year, end.month, end.day);
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
  createProgramTable();
  addPlanColumns();
  addStudentColumns();
  createCreditTable();
}

// Other credit: units on a plan that aren't courses in our catalog. requirement_id has no
// foreign key because seed() reloads degree_requirement on every start; savePlan checks it
// instead. Requirement ids are their position in requirements.json, so they stay the same
// as long as requirements are only added at the end of that file.
void Database::createCreditTable() {
  exec(R"sql(
    CREATE TABLE IF NOT EXISTS plan_credit (
      credit_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id        INTEGER NOT NULL REFERENCES degree_plan(plan_id) ON DELETE CASCADE,
      kind           TEXT NOT NULL CHECK (kind IN ('core', 'elective', 'ap', 'transfer', 'abroad')),
      description    TEXT NOT NULL,
      units          INTEGER NOT NULL CHECK (units BETWEEN 1 AND 60),
      requirement_id INTEGER,
      position       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS plan_credit_plan ON plan_credit(plan_id);
  )sql");
}

// Finished quarters: the last quarter whose results the student confirmed, NULL until they
// confirm one. Added with ALTER TABLE so existing students are kept.
void Database::addStudentColumns() {
  if (!hasColumn("student", "confirmed_through")) {
    exec("ALTER TABLE student ADD COLUMN confirmed_through INTEGER CHECK (confirmed_through BETWEEN 0 AND 11)");
  }
}

// Several plans: each has a name and the emphasis it follows (NULL until one is chosen).
// Added with ALTER TABLE so existing plans are kept; they're named "Main plan".
void Database::addPlanColumns() {
  if (!hasColumn("degree_plan", "name")) {
    exec("ALTER TABLE degree_plan ADD COLUMN name TEXT NOT NULL DEFAULT 'Main plan'");
  }
  if (!hasColumn("degree_plan", "program_id")) {
    exec("ALTER TABLE degree_plan ADD COLUMN program_id INTEGER REFERENCES program(program_id) ON DELETE SET NULL");
  }
  neverReusePlanIds();
  // Every student has at least one plan. Sign-up makes a "Main plan"; students who signed
  // up before it did (and never saved) get an empty one here.
  Statement backfill(db_, R"sql(
    INSERT INTO degree_plan (student_id, last_saved)
      SELECT student_id, ? FROM student
      WHERE student_id NOT IN (SELECT student_id FROM degree_plan))sql");
  backfill.bind(1, nowIso());
  backfill.run();
}

// Without AUTOINCREMENT, SQLite gives a new plan the id of the newest plan if it was
// deleted. A browser that still had the deleted plan open would then save its courses over
// the new plan (#22). Older databases are rebuilt with AUTOINCREMENT, keeping every plan
// and its id, so saved courses stay attached.
void Database::neverReusePlanIds() {
  Statement autoincrement(db_, R"sql(
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'degree_plan' AND sql LIKE '%AUTOINCREMENT%')sql");
  if (autoincrement.step()) return;
  // Foreign keys must be off while degree_plan is dropped, or dropping it would delete
  // every plan_course row. The pragma can't change inside a transaction.
  exec("PRAGMA foreign_keys = OFF");
  exec("BEGIN");
  try {
    exec(R"sql(
      CREATE TABLE degree_plan_new (
        plan_id    INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES student(student_id) ON DELETE CASCADE,
        last_saved TEXT NOT NULL,
        name       TEXT NOT NULL DEFAULT 'Main plan',
        program_id INTEGER REFERENCES program(program_id) ON DELETE SET NULL
      );
      INSERT INTO degree_plan_new (plan_id, student_id, last_saved, name, program_id)
        SELECT plan_id, student_id, last_saved, name, program_id FROM degree_plan;
      DROP TABLE degree_plan;
      ALTER TABLE degree_plan_new RENAME TO degree_plan;
      CREATE INDEX IF NOT EXISTS degree_plan_student ON degree_plan(student_id);
    )sql");
    Statement broken(db_, "SELECT 1 FROM pragma_foreign_key_check");
    if (broken.step()) throw std::runtime_error("Rebuilding degree_plan broke a foreign key");
    exec("COMMIT");
  } catch (...) {
    exec("ROLLBACK");
    exec("PRAGMA foreign_keys = ON");
    throw;
  }
  exec("PRAGMA foreign_keys = ON");
}

// The major, its emphases and the University Core. Seeded from programs.json.
void Database::createProgramTable() {
  exec(R"sql(
    CREATE TABLE IF NOT EXISTS program (
      program_id INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      kind       TEXT NOT NULL CHECK (kind IN ('major', 'emphasis', 'core'))
    );
  )sql");
  // Each requirement belongs to one program. units is the minimum units, for the requirements
  // the bulletin also measures in units (a Pathway), and NULL otherwise. Added with ALTER
  // TABLE so a database from before programs keeps working; seed() fills them in.
  if (!hasColumn("degree_requirement", "program_id")) {
    exec("ALTER TABLE degree_requirement ADD COLUMN program_id INTEGER REFERENCES program(program_id)");
  }
  if (!hasColumn("degree_requirement", "units")) {
    exec("ALTER TABLE degree_requirement ADD COLUMN units INTEGER");
  }
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

bool Database::hasColumn(const std::string& table, const std::string& column) {
  Statement info(db_, "SELECT 1 FROM pragma_table_info(?) WHERE name = ?");
  info.bind(1, table).bind(2, column);
  return info.step();
}

// Tables from the ER diagram (see API.md).
void Database::createTables() {
  // Plans saved before accounts have no owner, so no student could ever reach them.
  // Drop them so degree_plan is recreated with student_id below.
  if (hasColumn("degree_plan", "plan_id") && !hasColumn("degree_plan", "student_id")) {
    exec("DROP TABLE IF EXISTS plan_course; DROP TABLE degree_plan;");
  }
  exec(R"sql(
    CREATE TABLE IF NOT EXISTS student (
      student_id    INTEGER PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      start_year    INTEGER NOT NULL
    );
    -- A logged-in browser. token is the value of the session cookie.
    CREATE TABLE IF NOT EXISTS session (
      token      TEXT PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES student(student_id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL  -- Unix time in seconds
    );
    CREATE TABLE IF NOT EXISTS course (
      course_id   INTEGER PRIMARY KEY,
      code        TEXT NOT NULL UNIQUE,
      title       TEXT NOT NULL,
      units       INTEGER NOT NULL,
      description TEXT NOT NULL
    );
    -- Rebuilt from courses.json on every start, so it's safe to drop. Dropping it also
    -- replaces the old version that stored prerequisite codes instead of ids.
    DROP TABLE IF EXISTS course_prerequisite;
    CREATE TABLE course_prerequisite (
      course_id       INTEGER NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
      prerequisite_id INTEGER NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
      prereq_group    INTEGER NOT NULL,
      PRIMARY KEY (course_id, prerequisite_id, prereq_group)
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
    -- Not UNIQUE on student_id: a student can own several plans.
    -- AUTOINCREMENT so a deleted plan's id is never given to a new plan (see
    -- neverReusePlanIds).
    CREATE TABLE IF NOT EXISTS degree_plan (
      plan_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES student(student_id) ON DELETE CASCADE,
      last_saved TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS degree_plan_student ON degree_plan(student_id);
  )sql");
  createPlanCourse("plan_course");

  // Before retakes, plan_course allowed each course once per plan and had no 'failed'
  // status. Rebuild it with the new key and status, copying every saved row.
  // The old table's primary key is (plan_id, course_id); the new one adds quarter.
  bool beforeRetakes;
  {
    // Scoped so the statement is finished before the table is dropped.
    Statement keyColumns(db_, "SELECT COUNT(*) FROM pragma_table_info('plan_course') WHERE pk > 0");
    keyColumns.step();
    beforeRetakes = keyColumns.intAt(0) == 2;
  }
  if (beforeRetakes) {
    exec("BEGIN");
    try {
      createPlanCourse("plan_course_new");
      exec(R"sql(
        INSERT INTO plan_course_new (plan_id, course_id, quarter, status, position)
          SELECT plan_id, course_id, quarter, status, position FROM plan_course;
        DROP TABLE plan_course;
        ALTER TABLE plan_course_new RENAME TO plan_course;
      )sql");
      exec("COMMIT");
    } catch (...) {
      exec("ROLLBACK");
      throw;
    }
  }
}

// position keeps the order courses were added within each quarter. A course can be in a
// plan more than once (a retake after a failed attempt), but only once per quarter.
void Database::createPlanCourse(const std::string& table) {
  exec("CREATE TABLE IF NOT EXISTS " + table + R"sql( (
      plan_id   INTEGER NOT NULL REFERENCES degree_plan(plan_id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
      quarter   INTEGER NOT NULL CHECK (quarter BETWEEN 0 AND 11),
      status    TEXT NOT NULL CHECK (status IN ('planned', 'completed', 'failed')),
      position  INTEGER NOT NULL,
      PRIMARY KEY (plan_id, course_id, quarter)
    ))sql");
}

void Database::seed(const std::string& dataDir) {
  json courseData = readJsonFile(dataDir + "/courses.json");
  json requirementData = readJsonFile(dataDir + "/requirements.json");
  json programData = readJsonFile(dataDir + "/programs.json");

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
        "INSERT OR IGNORE INTO course_prerequisite (course_id, prerequisite_id, prereq_group) VALUES (?, ?, ?)");
    for (const auto& c : courseData) {
      int courseId = ids.at(c.at("code").get<std::string>());
      int group = 0;
      for (const auto& alternatives : c.at("prerequisites")) {
        for (const auto& code : alternatives) {
          auto it = ids.find(code.get<std::string>());
          if (it == ids.end()) {
            throw std::runtime_error(c.at("code").get<std::string>() + " lists the prerequisite " +
                                     code.get<std::string>() + ", which isn't in courses.json");
          }
          prereq.bind(1, courseId).bind(2, it->second).bind(3, group);
          prereq.run();
        }
        ++group;
      }
    }

    // Requirements are deleted first because they point at programs.
    exec("DELETE FROM course_requirement");
    exec("DELETE FROM degree_requirement");

    // Program ids are their position in programs.json, starting at 1. Upserted by id, not
    // deleted and reinserted, so anything that points at a program keeps pointing at it.
    Statement program(db_, R"sql(
      INSERT INTO program (program_id, name, kind) VALUES (?, ?, ?)
      ON CONFLICT(program_id) DO UPDATE SET name = excluded.name, kind = excluded.kind)sql");
    std::map<std::string, int> programIds;  // name -> program_id
    int programId = 1;
    for (const auto& p : programData) {
      std::string kind = p.at("kind");
      if (kind != "major" && kind != "emphasis" && kind != "core") {
        throw std::runtime_error("programs.json: \"" + kind + "\" isn't major, emphasis or core");
      }
      std::string name = p.at("name");
      programIds[name] = programId;
      program.bind(1, programId++).bind(2, name).bind(3, kind);
      program.run();
    }
    Statement dropPrograms(db_, "DELETE FROM program WHERE program_id >= ?");
    dropPrograms.bind(1, programId);
    dropPrograms.run();

    // Requirement ids are their position in requirements.json, starting at 1.
    Statement requirement(db_, R"sql(
      INSERT INTO degree_requirement (requirement_id, description, count, program_id, units)
      VALUES (?, ?, ?, ?, ?))sql");
    Statement satisfies(db_,
        "INSERT OR IGNORE INTO course_requirement (course_id, requirement_id, position) VALUES (?, ?, ?)");
    int requirementId = 1;
    for (const auto& r : requirementData) {
      const auto& courses = r.at("courses");
      std::string description = r.at("description");
      int count = r.contains("count") ? r.at("count").get<int>() : static_cast<int>(courses.size());
      auto owner = programIds.find(r.at("program").get<std::string>());
      if (owner == programIds.end()) {
        throw std::runtime_error("requirements.json: \"" + description + "\" names the program \"" +
                                 r.at("program").get<std::string>() + "\", which isn't in programs.json");
      }
      requirement.bind(1, requirementId).bind(2, description).bind(3, count).bind(4, owner->second);
      if (r.contains("units")) requirement.bind(5, r.at("units").get<int>());  // left unbound: NULL
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
    SELECT p.course_id, p.prereq_group, c.code FROM course_prerequisite p
    JOIN course c ON c.course_id = p.prerequisite_id
    ORDER BY p.course_id, p.prereq_group, p.rowid)sql");
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
    SELECT r.requirement_id, r.description, r.count, r.program_id, r.units, c.code
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
                        {"programId", all.intAt(3)},
                        {"units", all.isNull(4) ? json(nullptr) : json(all.intAt(4))},
                        {"courses", json::array()}});
    }
    if (!all.isNull(5)) result.back()["courses"].push_back(all.textAt(5));
  }
  return result;
}

json Database::programs() {
  std::lock_guard<std::mutex> lock(mutex_);
  json result = json::array();
  Statement all(db_, "SELECT program_id, name, kind FROM program ORDER BY program_id");
  while (all.step()) {
    result.push_back({{"programId", all.intAt(0)}, {"name", all.textAt(1)}, {"kind", all.textAt(2)}});
  }
  return result;
}

std::optional<json> Database::planById(int studentId, int planId) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!ownsPlan(studentId, planId)) return std::nullopt;
  return planWithCourses(planId);
}

json Database::planWithCourses(int planId) {
  Statement find(db_, "SELECT last_saved FROM degree_plan WHERE plan_id = ?");
  find.bind(1, planId);
  find.step();
  json result = {
      {"planId", planId}, {"lastSaved", find.textAt(0)}, {"courses", json::array()}, {"credits", json::array()}};

  Statement rows(db_, R"sql(
    SELECT c.code, pc.quarter, pc.status FROM plan_course pc
    JOIN course c ON c.course_id = pc.course_id
    WHERE pc.plan_id = ? ORDER BY pc.quarter, pc.position)sql");
  rows.bind(1, planId);
  while (rows.step()) {
    result["courses"].push_back(
        {{"code", rows.textAt(0)}, {"quarter", rows.intAt(1)}, {"status", rows.textAt(2)}});
  }

  Statement credits(db_, R"sql(
    SELECT kind, description, units, requirement_id FROM plan_credit
    WHERE plan_id = ? ORDER BY position)sql");
  credits.bind(1, planId);
  while (credits.step()) {
    json requirementId = credits.isNull(3) ? json(nullptr) : json(credits.intAt(3));
    result["credits"].push_back({{"kind", credits.textAt(0)}, {"description", credits.textAt(1)},
                                 {"units", credits.intAt(2)}, {"requirementId", requirementId}});
  }
  return result;
}

bool Database::ownsPlan(int studentId, int planId) {
  Statement find(db_, "SELECT 1 FROM degree_plan WHERE plan_id = ? AND student_id = ?");
  find.bind(1, planId).bind(2, studentId);
  return find.step();
}

// shared is always false until share links are built.
json Database::planSummary(int planId) {
  Statement find(db_, "SELECT name, program_id, last_saved FROM degree_plan WHERE plan_id = ?");
  find.bind(1, planId);
  find.step();
  return {{"planId", planId},
          {"name", find.textAt(0)},
          {"programId", find.isNull(1) ? json(nullptr) : json(find.intAt(1))},
          {"lastSaved", find.textAt(2)},
          {"shared", false}};
}

void Database::checkEmphasis(std::optional<int> programId) {
  if (!programId) return;
  Statement find(db_, "SELECT 1 FROM program WHERE program_id = ? AND kind = 'emphasis'");
  find.bind(1, *programId);
  if (!find.step()) throw BadRequest("\"programId\" must be an emphasis");
}

json Database::plans(int studentId) {
  std::lock_guard<std::mutex> lock(mutex_);
  json result = json::array();
  std::vector<int> ids;
  {
    Statement all(db_, "SELECT plan_id FROM degree_plan WHERE student_id = ? ORDER BY plan_id");
    all.bind(1, studentId);
    while (all.step()) ids.push_back(all.intAt(0));
  }
  for (int id : ids) result.push_back(planSummary(id));
  return result;
}

json Database::createPlan(int studentId, const std::string& name, std::optional<int> programId,
                          std::optional<int> copyFrom) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (copyFrom && !ownsPlan(studentId, *copyFrom)) throw NotFound("Plan not found");
  checkEmphasis(programId);
  exec("BEGIN");
  try {
    Statement create(db_, "INSERT INTO degree_plan (student_id, last_saved, name, program_id) VALUES (?, ?, ?, ?)");
    create.bind(1, studentId).bind(2, nowIso()).bind(3, name);
    if (programId) create.bind(4, *programId);  // left unbound, it's NULL
    create.run();
    int planId = static_cast<int>(sqlite3_last_insert_rowid(db_));
    if (copyFrom) {
      // Every column but plan_id, so the copy keeps whatever plan_course stores.
      Statement copy(db_, R"sql(
        INSERT INTO plan_course (plan_id, course_id, quarter, status, position)
          SELECT ?, course_id, quarter, status, position FROM plan_course WHERE plan_id = ?)sql");
      copy.bind(1, planId).bind(2, *copyFrom);
      copy.run();
      Statement copyCredits(db_, R"sql(
        INSERT INTO plan_credit (plan_id, kind, description, units, requirement_id, position)
          SELECT ?, kind, description, units, requirement_id, position FROM plan_credit WHERE plan_id = ?)sql");
      copyCredits.bind(1, planId).bind(2, *copyFrom);
      copyCredits.run();
    }
    exec("COMMIT");
    return planSummary(planId);
  } catch (...) {
    exec("ROLLBACK");
    throw;
  }
}

json Database::updatePlan(int studentId, int planId, const PlanChanges& changes) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!ownsPlan(studentId, planId)) throw NotFound("Plan not found");
  if (changes.changeProgram) checkEmphasis(changes.programId);
  if (changes.name) {
    Statement rename(db_, "UPDATE degree_plan SET name = ? WHERE plan_id = ?");
    rename.bind(1, *changes.name).bind(2, planId);
    rename.run();
  }
  if (changes.changeProgram) {
    Statement program(db_, "UPDATE degree_plan SET program_id = ? WHERE plan_id = ?");
    if (changes.programId) program.bind(1, *changes.programId);  // left unbound, it's NULL
    program.bind(2, planId);
    program.run();
  }
  return planSummary(planId);
}

void Database::deletePlan(int studentId, int planId) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!ownsPlan(studentId, planId)) throw NotFound("Plan not found");
  Statement count(db_, "SELECT COUNT(*) FROM degree_plan WHERE student_id = ?");
  count.bind(1, studentId);
  count.step();
  if (count.intAt(0) <= 1) throw BadRequest("You need at least one plan");
  // plan_course rows go with it (ON DELETE CASCADE).
  Statement remove(db_, "DELETE FROM degree_plan WHERE plan_id = ?");
  remove.bind(1, planId);
  remove.run();
}

SavedPlan Database::savePlan(int studentId, int planId, const std::vector<PlanRow>& rows,
                             const std::optional<std::vector<PlanCredit>>& credits) {
  std::lock_guard<std::mutex> lock(mutex_);

  // Check every row before writing anything.
  std::vector<int> courseIds;
  std::map<int, int> unitsInQuarter;
  Statement findCourse(db_, "SELECT course_id, units FROM course WHERE code = ?");
  for (const auto& row : rows) {
    findCourse.bind(1, row.code);
    if (!findCourse.step()) throw BadRequest(row.code + " is not an offered course");
    courseIds.push_back(findCourse.intAt(0));
    if ((unitsInQuarter[row.quarter] += findCourse.intAt(1)) > kMaxUnitsPerQuarter) {
      throw BadRequest(quarterLabel(row.quarter) + " can't have more than " +
                       std::to_string(kMaxUnitsPerQuarter) + " units");
    }
    findCourse.reset();
  }
  checkAttempts(rows);
  if (credits) {
    Statement findRequirement(db_, "SELECT 1 FROM degree_requirement WHERE requirement_id = ?");
    for (const auto& credit : *credits) {
      if (!credit.requirementId) continue;
      findRequirement.bind(1, *credit.requirementId);
      if (!findRequirement.step()) {
        throw BadRequest("Requirement " + std::to_string(*credit.requirementId) + " doesn't exist");
      }
      findRequirement.reset();
    }
  }

  std::string lastSaved = nowIso();
  exec("BEGIN");
  try {
    if (!ownsPlan(studentId, planId)) throw NotFound("Plan not found");
    Statement touch(db_, "UPDATE degree_plan SET last_saved = ? WHERE plan_id = ?");
    touch.bind(1, lastSaved).bind(2, planId);
    touch.run();

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

    if (credits) {
      Statement clearCredits(db_, "DELETE FROM plan_credit WHERE plan_id = ?");
      clearCredits.bind(1, planId);
      clearCredits.run();
      Statement insertCredit(db_, R"sql(
        INSERT INTO plan_credit (plan_id, kind, description, units, requirement_id, position)
        VALUES (?, ?, ?, ?, ?, ?))sql");
      for (size_t i = 0; i < credits->size(); ++i) {
        const PlanCredit& credit = (*credits)[i];
        insertCredit.bind(1, planId).bind(2, credit.kind).bind(3, credit.description)
            .bind(4, credit.units).bind(6, static_cast<int>(i));
        if (credit.requirementId) insertCredit.bind(5, *credit.requirementId);  // left unbound, it's NULL
        insertCredit.run();
      }
    }
    exec("COMMIT");
  } catch (...) {
    exec("ROLLBACK");
    throw;
  }
  return {planId, lastSaved};
}

int Database::createStudent(const std::string& email, const std::string& passwordHash, int startYear) {
  std::lock_guard<std::mutex> lock(mutex_);
  Statement taken(db_, "SELECT 1 FROM student WHERE email = ?");
  taken.bind(1, email);
  if (taken.step()) throw EmailTaken("An account with that email already exists");

  // The student and their first plan, an empty "Main plan" with no emphasis, together.
  exec("BEGIN");
  try {
    Statement insert(db_, "INSERT INTO student (email, password_hash, start_year) VALUES (?, ?, ?)");
    insert.bind(1, email).bind(2, passwordHash).bind(3, startYear);
    insert.run();
    int studentId = static_cast<int>(sqlite3_last_insert_rowid(db_));
    Statement plan(db_, "INSERT INTO degree_plan (student_id, last_saved, name) VALUES (?, ?, 'Main plan')");
    plan.bind(1, studentId).bind(2, nowIso());
    plan.run();
    exec("COMMIT");
    return studentId;
  } catch (...) {
    exec("ROLLBACK");
    throw;
  }
}

std::optional<StudentLogin> Database::findStudentByEmail(const std::string& email) {
  std::lock_guard<std::mutex> lock(mutex_);
  Statement find(db_, "SELECT student_id, password_hash FROM student WHERE email = ?");
  find.bind(1, email);
  if (!find.step()) return std::nullopt;
  return StudentLogin{find.intAt(0), find.textAt(1)};
}

std::optional<json> Database::student(int studentId) {
  std::lock_guard<std::mutex> lock(mutex_);
  Statement find(db_, "SELECT email, start_year FROM student WHERE student_id = ?");
  find.bind(1, studentId);
  if (!find.step()) return std::nullopt;
  return json{{"email", find.textAt(0)}, {"startYear", find.intAt(1)}};
}

std::optional<int> Database::confirmedThrough(int studentId) {
  std::lock_guard<std::mutex> lock(mutex_);
  Statement find(db_, "SELECT confirmed_through FROM student WHERE student_id = ?");
  find.bind(1, studentId);
  if (!find.step() || find.isNull(0)) return std::nullopt;
  return find.intAt(0);
}

void Database::confirmQuarters(int studentId, int planId, int quarter, const Date& today) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!ownsPlan(studentId, planId)) throw NotFound("Plan not found");

  Statement findYear(db_, "SELECT start_year FROM student WHERE student_id = ?");
  findYear.bind(1, studentId);
  if (!findYear.step()) throw NotFound("Plan not found");
  if (!hasEnded(findYear.intAt(0), quarter, today)) throw BadRequest(quarterLabel(quarter) + " hasn't ended yet");

  // The plan's courses in the quarters being confirmed. Each needs a result.
  auto rowsOf = [&](int id, const char* quarters) {
    Statement rows(db_, std::string(R"sql(
      SELECT c.code, pc.quarter, pc.status FROM plan_course pc
      JOIN course c ON c.course_id = pc.course_id
      WHERE pc.plan_id = ? AND pc.quarter )sql") + quarters + " ? ORDER BY pc.quarter, pc.position");
    rows.bind(1, id).bind(2, quarter);
    std::vector<PlanRow> result;
    while (rows.step()) result.push_back({rows.textAt(0), rows.intAt(1), rows.textAt(2)});
    return result;
  };
  std::vector<PlanRow> past = rowsOf(planId, "<=");
  for (const auto& row : past) {
    if (row.status == "planned") {
      throw BadRequest(row.code + " in " + quarterLabel(row.quarter) + " needs a result: completed or failed");
    }
  }

  // Every other plan gets these quarters in place of its own. Its later quarters stay, so
  // check that they still follow the retake rule before changing anything.
  std::vector<int> others;
  {
    Statement all(db_, "SELECT plan_id, name FROM degree_plan WHERE student_id = ? AND plan_id <> ? ORDER BY plan_id");
    all.bind(1, studentId).bind(2, planId);
    while (all.step()) {
      std::vector<PlanRow> merged = past;
      for (auto& row : rowsOf(all.intAt(0), ">")) merged.push_back(row);
      checkAttempts(merged, "In \"" + all.textAt(1) + "\": ");
      others.push_back(all.intAt(0));
    }
  }

  std::string lastSaved = nowIso();
  exec("BEGIN");
  try {
    Statement clear(db_, "DELETE FROM plan_course WHERE plan_id = ? AND quarter <= ?");
    Statement copy(db_, R"sql(
      INSERT INTO plan_course (plan_id, course_id, quarter, status, position)
        SELECT ?, course_id, quarter, status, position FROM plan_course
        WHERE plan_id = ? AND quarter <= ?)sql");
    Statement touch(db_, "UPDATE degree_plan SET last_saved = ? WHERE plan_id = ?");
    for (int other : others) {
      clear.bind(1, other).bind(2, quarter);
      clear.run();
      copy.bind(1, other).bind(2, planId).bind(3, quarter);
      copy.run();
      touch.bind(1, lastSaved).bind(2, other);
      touch.run();
    }
    Statement confirm(db_, "UPDATE student SET confirmed_through = ? WHERE student_id = ?");
    confirm.bind(1, quarter).bind(2, studentId);
    confirm.run();
    exec("COMMIT");
  } catch (...) {
    exec("ROLLBACK");
    throw;
  }
}

void Database::createSession(const std::string& token, int studentId, int lifetimeSeconds) {
  std::lock_guard<std::mutex> lock(mutex_);
  // Clean up expired sessions here so the table doesn't grow forever.
  exec("DELETE FROM session WHERE expires_at <= unixepoch()");
  Statement insert(db_, "INSERT INTO session (token, student_id, expires_at) VALUES (?, ?, unixepoch() + ?)");
  insert.bind(1, token).bind(2, studentId).bind(3, lifetimeSeconds);
  insert.run();
}

std::optional<int> Database::studentForSession(const std::string& token) {
  std::lock_guard<std::mutex> lock(mutex_);
  Statement find(db_, "SELECT student_id FROM session WHERE token = ? AND expires_at > unixepoch()");
  find.bind(1, token);
  if (!find.step()) return std::nullopt;
  return find.intAt(0);
}

void Database::deleteSession(const std::string& token) {
  std::lock_guard<std::mutex> lock(mutex_);
  Statement remove(db_, "DELETE FROM session WHERE token = ?");
  remove.bind(1, token);
  remove.run();
}
