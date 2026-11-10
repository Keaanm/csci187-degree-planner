cmake_minimum_required(VERSION 3.20)
project(degree_planner_server LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# Dependencies are downloaded at configure time, so nothing needs to be installed by hand.
include(FetchContent)

set(HTTPLIB_USE_OPENSSL_IF_AVAILABLE OFF CACHE BOOL "" FORCE)
set(HTTPLIB_USE_ZLIB_IF_AVAILABLE OFF CACHE BOOL "" FORCE)
set(HTTPLIB_USE_BROTLI_IF_AVAILABLE OFF CACHE BOOL "" FORCE)
set(HTTPLIB_USE_ZSTD_IF_AVAILABLE OFF CACHE BOOL "" FORCE)
FetchContent_Declare(httplib
  GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
  GIT_TAG v0.18.7
  GIT_SHALLOW TRUE)

set(JSON_BuildTests OFF CACHE INTERNAL "")
FetchContent_Declare(json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.11.3
  GIT_SHALLOW TRUE)

# SQLite 3.38 amalgamation with a CMake build.
FetchContent_Declare(sqlite
  GIT_REPOSITORY https://github.com/azadkuh/sqlite-amalgamation.git
  GIT_TAG 15d0ff10ebc7e7225eced1de84bb52137000899b)

# libsodium for password hashing (argon2id) and random session tokens. libsodium has no
# CMake build of its own, so this wrapper builds it from source on every platform.
set(SODIUM_DISABLE_TESTS ON CACHE BOOL "" FORCE)
FetchContent_Declare(sodium
  GIT_REPOSITORY https://github.com/robinlinden/libsodium-cmake.git
  GIT_TAG 9b2848dfc1b917a9410f0de9d81059b26cbfaa8d)

FetchContent_MakeAvailable(httplib json sqlite sodium)

# The library holds everything except main(), so the tests can link it too.
add_library(planner_core
  src/Auth.cpp
  src/Database.cpp
  src/Routes.cpp)
target_include_directories(planner_core PUBLIC src ${sqlite_SOURCE_DIR})
target_link_libraries(planner_core PUBLIC httplib::httplib nlohmann_json::nlohmann_json SQLite3 sodium)
# Seed data shared with the frontend.
target_compile_definitions(planner_core PUBLIC
  DEFAULT_DATA_DIR="${CMAKE_CURRENT_SOURCE_DIR}/../src/data")

add_executable(degree_planner_server src/main.cpp)
target_link_libraries(degree_planner_server PRIVATE planner_core)

enable_testing()
add_executable(api_test tests/api_test.cpp)
target_link_libraries(api_test PRIVATE planner_core)
add_test(NAME api_test COMMAND api_test)
