#pragma once

#include <httplib.h>

#include "Database.h"

// Registers the routes in API.md on the server.
void registerRoutes(httplib::Server& server, Database& db);
