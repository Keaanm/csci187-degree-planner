#include <cstring>
#include <iostream>
#include <string>

#include "Database.h"
#include "Routes.h"

// Usage: degree_planner_server [--port 3001] [--db degree_planner.db] [--data <dir with courses.json>]
int main(int argc, char** argv) {
  int port = 3001;
  std::string dbPath = "degree_planner.db";
  std::string dataDir = DEFAULT_DATA_DIR;

  for (int i = 1; i < argc; i += 2) {
    if (i + 1 == argc) {
      std::cerr << "Missing a value for " << argv[i] << "\n";
      return 1;
    }
    if (!std::strcmp(argv[i], "--port")) {
      try {
        port = std::stoi(argv[i + 1]);
      } catch (const std::exception&) {
        std::cerr << "--port must be a number\n";
        return 1;
      }
    } else if (!std::strcmp(argv[i], "--db")) dbPath = argv[i + 1];
    else if (!std::strcmp(argv[i], "--data")) dataDir = argv[i + 1];
    else {
      std::cerr << "Unknown option " << argv[i] << "\n";
      return 1;
    }
  }

  try {
    Database db(dbPath);
    db.seed(dataDir);

    httplib::Server server;
    registerRoutes(server, db);
    std::cout << "Degree planner API listening on http://localhost:" << port << " (database: " << dbPath
              << ")" << std::endl;
    if (!server.listen("0.0.0.0", port)) {
      std::cerr << "Couldn't listen on port " << port << " (is something else using it?)\n";
      return 1;
    }
  } catch (const std::exception& e) {
    std::cerr << e.what() << "\n";
    return 1;
  }
}
