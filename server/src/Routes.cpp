#include "Routes.h"

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <iostream>

#include "Auth.h"

using nlohmann::json;

namespace {

void sendJson(httplib::Response& res, const json& body, int status = 200) {
  res.status = status;
  res.set_content(body.dump(), "application/json");
}

void sendError(httplib::Response& res, int status, const std::string& message) {
  sendJson(res, {{"error", message}}, status);
}

// How long a login lasts: 30 days.
constexpr int kSessionSeconds = 30 * 24 * 60 * 60;
constexpr const char* kCookieName = "session";

// The value of one cookie from the Cookie header, or "" if it isn't there.
// (httplib doesn't parse cookies, so this splits "a=1; session=abc" by hand.)
std::string readCookie(const httplib::Request& req, const std::string& name) {
  std::string header = req.get_header_value("Cookie");
  size_t start = 0;
  while (start < header.size()) {
    size_t end = header.find(';', start);
    if (end == std::string::npos) end = header.size();
    std::string pair = header.substr(start, end - start);
    size_t first = pair.find_first_not_of(' ');
    if (first != std::string::npos) pair = pair.substr(first);
    size_t equals = pair.find('=');
    if (equals != std::string::npos && pair.substr(0, equals) == name) return pair.substr(equals + 1);
    start = end + 1;
  }
  return "";
}

// HttpOnly so page scripts can't read the token; SameSite=Lax so other sites can't send it
// with their own POST/PUT requests.
void setSessionCookie(httplib::Response& res, const std::string& token, int maxAge) {
  res.set_header("Set-Cookie", std::string(kCookieName) + "=" + token +
                                   "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + std::to_string(maxAge));
}

// Logs the student in: a new session row plus the cookie that points to it.
void startSession(Database& db, httplib::Response& res, int studentId) {
  std::string token = auth::newSessionToken();
  db.createSession(token, studentId, kSessionSeconds);
  setSessionCookie(res, token, kSessionSeconds);
}

// The logged-in student. Returns false (and sends a 401) if there's no valid session.
bool currentStudent(Database& db, const httplib::Request& req, httplib::Response& res, int& studentId) {
  std::string token = readCookie(req, kCookieName);
  if (!token.empty()) {
    if (auto id = db.studentForSession(token)) {
      studentId = *id;
      return true;
    }
  }
  sendError(res, 401, "You need to log in");
  return false;
}

struct Credentials {
  std::string email;
  std::string password;
};

// Trimmed and lowercased, so "Ana@SCU.edu " and "ana@scu.edu" are the same account.
std::string normalizeEmail(std::string email) {
  auto notSpace = [](unsigned char c) { return !std::isspace(c); };
  email.erase(email.begin(), std::find_if(email.begin(), email.end(), notSpace));
  email.erase(std::find_if(email.rbegin(), email.rend(), notSpace).base(), email.end());
  std::transform(email.begin(), email.end(), email.begin(), [](unsigned char c) { return std::tolower(c); });
  return email;
}

// Login and sign-up only accept JSON. A form on another site can POST text/plain or
// form-encoded bodies without CORS, which would let it log a visitor into the attacker's
// account; it can't send application/json without the browser asking this server first.
void requireJson(const httplib::Request& req) {
  if (req.get_header_value("Content-Type").rfind("application/json", 0) != 0) {
    throw BadRequest("Content-Type must be application/json");
  }
}

// One "@", something before it, and a domain with a dot that isn't at either end or doubled.
// No spaces, control characters, or characters that are only legal in quoted emails.
bool isValidEmail(const std::string& email) {
  static const std::string kNotAllowed = "\",;:<>()[]\\";
  if (email.size() > 254) return false;
  for (unsigned char c : email) {
    if (c <= ' ' || c == 0x7f || kNotAllowed.find(static_cast<char>(c)) != std::string::npos) return false;
  }
  size_t at = email.find('@');
  if (at == std::string::npos || at == 0 || email.find('@', at + 1) != std::string::npos) return false;
  std::string domain = email.substr(at + 1);
  size_t dot = domain.find('.');
  return dot != std::string::npos && domain.front() != '.' && domain.back() != '.' &&
         domain.find("..") == std::string::npos;
}

json parseObject(const httplib::Request& req) {
  requireJson(req);
  json parsed = json::parse(req.body, nullptr, false);
  if (parsed.is_discarded() || !parsed.is_object()) throw BadRequest("Body must be a JSON object");
  return parsed;
}

Credentials parseCredentials(const json& body) {
  if (!body.contains("email") || !body["email"].is_string()) throw BadRequest("Body needs a string \"email\"");
  if (!body.contains("password") || !body["password"].is_string()) {
    throw BadRequest("Body needs a string \"password\"");
  }
  return {normalizeEmail(body["email"]), body["password"]};
}

constexpr size_t kMinPasswordLength = 8;
// Long enough for any real password; stops someone sending megabytes to hash.
constexpr size_t kMaxPasswordLength = 256;

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

  // Creates an account and logs it in.
  server.Post("/api/signup", [&db](const httplib::Request& req, httplib::Response& res) {
    try {
      json body = parseObject(req);
      Credentials creds = parseCredentials(body);
      if (!isValidEmail(creds.email)) throw BadRequest("Enter a valid email address");
      if (creds.password.size() < kMinPasswordLength) {
        throw BadRequest("Password must be at least " + std::to_string(kMinPasswordLength) + " characters");
      }
      if (creds.password.size() > kMaxPasswordLength) {
        throw BadRequest("Password must be at most " + std::to_string(kMaxPasswordLength) + " characters");
      }
      if (!body.contains("startYear") || !body["startYear"].is_number_integer()) {
        throw BadRequest("Body needs an integer \"startYear\"");
      }
      auto startYear = body["startYear"].get<std::int64_t>();
      if (startYear < 2000 || startYear > 2100) throw BadRequest("\"startYear\" must be 2000 to 2100");

      int studentId = db.createStudent(creds.email, auth::hashPassword(creds.password), static_cast<int>(startYear));
      startSession(db, res, studentId);
      sendJson(res, *db.student(studentId), 201);
    } catch (const BadRequest& e) {
      sendError(res, 400, e.what());
    } catch (const EmailTaken& e) {
      sendError(res, 409, e.what());
    }
  });

  server.Post("/api/login", [&db](const httplib::Request& req, httplib::Response& res) {
    try {
      Credentials creds = parseCredentials(parseObject(req));
      auto found = db.findStudentByEmail(creds.email);
      bool ok = false;
      if (found && creds.password.size() <= kMaxPasswordLength) {
        ok = auth::verifyPassword(creds.password, found->passwordHash);
      } else {
        auth::verifyAgainstDummy(creds.password.substr(0, kMaxPasswordLength));
      }
      // The same message either way, so nobody can find out which emails have accounts.
      if (!ok) return sendError(res, 401, "Wrong email or password");
      // Replace any session this browser already had, so old tokens don't pile up.
      std::string oldToken = readCookie(req, kCookieName);
      if (!oldToken.empty()) db.deleteSession(oldToken);
      startSession(db, res, found->studentId);
      sendJson(res, *db.student(found->studentId));
    } catch (const BadRequest& e) {
      sendError(res, 400, e.what());
    }
  });

  // Always succeeds, even when already logged out.
  server.Post("/api/logout", [&db](const httplib::Request& req, httplib::Response& res) {
    std::string token = readCookie(req, kCookieName);
    if (!token.empty()) db.deleteSession(token);
    setSessionCookie(res, "", 0);
    res.status = 204;
  });

  server.Get("/api/me", [&db](const httplib::Request& req, httplib::Response& res) {
    int studentId;
    if (!currentStudent(db, req, res, studentId)) return;
    auto student = db.student(studentId);
    if (!student) return sendError(res, 401, "You need to log in");
    sendJson(res, *student);
  });

  // The logged-in student's plan. There's no plan id in the URL, so a student can only
  // ever reach their own plan.
  server.Get("/api/me/plan", [&db](const httplib::Request& req, httplib::Response& res) {
    int studentId;
    if (!currentStudent(db, req, res, studentId)) return;
    auto plan = db.plan(studentId);
    if (!plan) return sendError(res, 404, "Plan not found");
    sendJson(res, *plan);
  });

  server.Put("/api/me/plan", [&db](const httplib::Request& req, httplib::Response& res) {
    int studentId;
    if (!currentStudent(db, req, res, studentId)) return;
    try {
      requireJson(req);
      SavedPlan saved = db.savePlan(studentId, parsePlanBody(req.body));
      sendJson(res, {{"planId", saved.planId}, {"lastSaved", saved.lastSaved}});
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
