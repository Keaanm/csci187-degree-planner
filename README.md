# SCU CS Degree Planner

CSCI 187 Group 6: Darren Hu, Henry Packer, Keaan Mirchandani, William Tran-Nguyen

A course planning and degree progress tool for Santa Clara University Computer Science undergraduates. Today, students plan by hand from PDF requirement sheets, Workday, and their own spreadsheets. They trace prerequisites themselves and check off requirements manually. With this tool, students can build a 4-year plan and see their progress toward their degree requirements.

The MVP covers the Computer Science major with the Software emphasis. Our team preloads the course and requirement data. There are no accounts. The plan is saved by the C++ backend in a SQLite database. Each server keeps one plan, so each person runs the app on their own machine to get their own plan; if two people share a server, they share the plan and the last save wins. The database and API already support many plans (`/api/plans/:planId`) for when accounts are added.

The full requirements are in [REQUIREMENTS.md](REQUIREMENTS.md), and the functional specifications are in [SPECIFICATIONS.md](SPECIFICATIONS.md).

## User requirements (MVP)

The user should be able to:

### Tracking progress
1. Record which courses they have completed
2. See which degree requirements they have completed and which remain
3. See how many units they have completed and how many remain

### Finding courses
1. Look up individual courses
2. See course descriptions and prerequisites
3. See which requirements the course satisfies

### Building a 4-year plan
1. Add courses to a quarter in their 4-year plan
2. See which remaining requirements their planned courses satisfy
3. Be warned when a course is placed before its prerequisites
4. Save their 4-year plan so it is still there when they come back

### Later (not in the MVP)
Selecting an emphasis and requirement data for the other CS emphases, the CS minor, the University Core, other majors, accounts (student and advisor), transfer credit, courses that count toward multiple requirements, the quarters a course is usually offered, professor ratings, all quarter schedule features (upcoming quarter search, time filters, conflict warnings, comparing schedules, backup classes, alternative courses), starting from the department's sample plan, a check for graduating by the expected quarter, replanning when a course becomes unavailable, study abroad paths, PDF export, and advisor features (sharing, viewing student plans, recommendations).

## Design

- [ER diagram V2](docs/er-diagram-v2.drawio): the database tables (Chen notation), matching `server/src/Database.cpp`.
- [CRC diagram V3](docs/crc-diagram-v3.drawio): the core domain classes (`DegreePlan`, `DegreeRequirement`, `Course`), their responsibilities and what each one knows.

Open the `.drawio` files at [app.diagrams.net](https://app.diagrams.net) (File → Open from → Device).

## Setup

Requirements: [Node.js](https://nodejs.org/) 22.12 or newer (current LTS recommended), git, [CMake](https://cmake.org/download/) 3.20 or newer, and a C++17 compiler (Xcode Command Line Tools on macOS: `xcode-select --install`; Visual Studio 2022 on Windows; `g++` on Linux).

```sh
git clone https://github.com/Keaanm/csci187-degree-planner.git
cd csci187-degree-planner
npm install
```

```sh
npm run dev      # build and start the C++ API (port 3001) and the frontend at http://localhost:5173
```

The first run takes a minute because CMake downloads and builds the C++ dependencies. Until the API is up, the page shows "Couldn't load data from the server"; click "Try again" once it's running. The saved plan goes in `server/degree_planner.db`; delete that file to start over.

Other commands:

```sh
npm run server   # start only the API
npm run dev:web  # start only the frontend
npm test         # run the unit tests once (Vitest)
npm run build    # type-check and build for production
npm run lint     # lint with oxlint
npm run server:test  # build the backend and run its API tests
```

On Windows, `npm run dev` can't start the API. Run `npm run dev:web`, and start the server binary directly after `npm run server:build`: `server\build\Release\degree_planner_server.exe --db server\degree_planner.db` (or `server\build\Debug\...`).

## Project layout

- `src/` contains the frontend. The domain logic (`DegreePlan`, `DegreeRequirement`, `Course`) is plain TypeScript, kept apart from React so it can be unit tested. `courseLookup.ts` has the course search and course detail lookups. `api.ts` is the only file that calls the backend, and `queries.ts` wraps it in TanStack Query hooks. The app gets courses and requirements only from the API; the seed files aren't part of the frontend build. `PlanProvider` keeps unsaved edits until the student clicks "Save plan".
- `src/data/` holds the preloaded course and requirement data for the B.S. in Computer Science (College of Arts and Sciences, Software emphasis), taken from the [2026-27 SCU Undergraduate Bulletin](https://www.scu.edu/appdata/pub/bulletin/undergraduate/2026-27/chapter-3-college-of-arts-and-sciences/mathematics-and-computer-science.html). Required 1-unit labs (e.g. CSEN 20L) are folded into their course's units. Every prerequisite is a course in the list, so the list also has the Computer Science and Engineering courses that appear as either/or prerequisites (CSEN 10, 11, 12, 79 and ECEN 120, from the [engineering bulletin](https://www.scu.edu/bulletin/undergraduate/chapter-5-school-of-engineering/computer-science-and-engineering.html)). CSEN 19 is cross-listed as MATH 51, so prerequisites use MATH 51. CSCI 187 also names CSEN 70, the former COEN 70, which is no longer in the bulletin, so it's left out.
- `src/App.tsx` defines the routes: `/` (the 4-year plan with degree progress), `/courses` (course lookup), and `/courses/:code` (one course). Pages are in `src/pages/`, components in `src/components/` (one per file), and the shadcn/ui components in `src/components/ui/`.
- `server/` is the C++ backend (see [API.md](API.md) for the routes). `Database.cpp` creates the SQLite tables and seeds them from `src/data/` on every start; `Routes.cpp` has the HTTP routes; `main.cpp` starts the server. `server/tests/api_test.cpp` starts the server with an in-memory database and calls every route.
- `tests/` contains the unit tests. Any file ending in `.test.ts` or `.test.tsx` runs automatically. `tests/catalog.ts` turns the seed files into objects so tests can use the real courses.
- `.github/workflows/ci.yml` runs on every push and pull request. It installs dependencies, builds, and runs the tests, and builds and tests the backend.

## Tech stack

Frontend: TypeScript, React, Vite, React Router, TanStack Query, Tailwind CSS, shadcn/ui, and Vitest. Backend: C++17 with [cpp-httplib](https://github.com/yhirose/cpp-httplib), [nlohmann/json](https://github.com/nlohmann/json), SQLite, and CMake. CI: GitHub Actions.
