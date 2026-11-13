# SCU CS Degree Planner

CSCI 187 Group 6: Darren Hu, Henry Packer, Keaan Mirchandani, William Tran-Nguyen

Plan your 4-year schedule and track your progress toward the SCU Computer Science degree (Software emphasis). The app replaces PDF requirement sheets and hand-made spreadsheets: it checks prerequisites and checks off requirements for you.

## Quick start

1. Install the prerequisites (see [Prerequisites](#prerequisites)).
2. Clone the repo and install the dependencies:

   ```sh
   git clone https://github.com/Keaanm/csci187-degree-planner.git
   cd csci187-degree-planner
   npm install
   ```

3. Start the backend and the frontend:

   ```sh
   npm run dev
   ```

4. Open http://localhost:5173 and create an account. Each account has its own plans.

The first run takes about a minute while CMake downloads and builds the C++ dependencies. If the page says "Couldn't load data from the server", wait for the API to start, then click **Try again**.

## Prerequisites

- [Node.js](https://nodejs.org/) 22.12 or newer
- git
- [CMake](https://cmake.org/download/) 3.20 or newer
- A C++17 compiler:
  - macOS: run `xcode-select --install`
  - Windows: Visual Studio 2022
  - Linux: `g++`

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Build and start the API (port 3001) and the frontend (port 5173) |
| `npm run server` | Start only the API |
| `npm run dev:web` | Start only the frontend |
| `npm test` | Run the frontend unit tests (Vitest) |
| `npm run server:test` | Build the backend and run its API tests |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Lint with oxlint |

To start over with no accounts or plans, stop the server and delete `server/degree_planner.db`.

### Windows

`npm run dev` can't start the API on Windows. Instead:

1. Run `npm run server:build`.
2. Start the API: `server\build\Release\degree_planner_server.exe --db server\degree_planner.db` (or `server\build\Debug\...`).
3. In a second terminal, run `npm run dev:web`.

## What the app covers so far

- The B.S. in Computer Science with the Software emphasis. Our team preloads the courses and requirements.
- Student accounts. A student signs up with their email, a password and the fall they started at SCU, and their plans are saved to their account in the backend's SQLite database.
- Several plans per student: make, copy, rename, delete and switch between them, for example to try a "what if".

The user requirements are in [REQUIREMENTS.md](REQUIREMENTS.md). The functional specifications are in [SPECIFICATIONS.md](SPECIFICATIONS.md). The API routes are in [API.md](API.md).

## Design

Final project design (what we're building next):

- [ER diagram V3](docs/er-diagram-v3.drawio): the database for the final project. Adds students, sessions, programs (major, emphases, University Core), other credit, and retakes.
- [CRC diagram V5](docs/crc-diagram-v5.drawio): the domain classes for the final project. Adds Student, Program, PlannedCourse and OtherCredit.

Built so far: the MVP diagrams below, plus ER V3's Student and Session tables (accounts). `API.md` lists the tables exactly as they are in `server/src/Database.cpp`.

- [ER diagram V2](docs/er-diagram-v2.drawio): the MVP database tables.
- [CRC diagram V4](docs/crc-diagram-v4.drawio): the domain classes, their responsibilities, and what each one knows.

Once the final project is built, the V2 and V4 diagrams will be removed.

To view a diagram, open [app.diagrams.net](https://app.diagrams.net) and choose **File → Open from → Device**.

## Project layout

| Path | Contents |
| --- | --- |
| `src/DegreePlan.ts`, `src/Catalog.ts`, `src/DegreeRequirement.ts`, `src/Course.ts` | Domain logic in plain TypeScript, kept apart from React so it can be unit tested. `Catalog` holds the courses and requirements and does the course lookups |
| `src/api.ts` | The only file that calls the backend |
| `src/queries.ts` | TanStack Query hooks around `api.ts` |
| `src/pages/`, `src/components/` | Pages and components, one per file. `src/components/ui/` holds the shadcn/ui components |
| `src/App.tsx` | Routes: `/login` and `/signup` (the only pages when logged out), `/` (the plan and progress), `/courses` (course lookup), `/courses/:code` (one course) |
| `src/data/` | Preloaded course and requirement data (see [Course data](#course-data)) |
| `server/src/` | C++ backend. `Database.cpp` creates and seeds the SQLite tables, `Routes.cpp` has the HTTP routes, `Auth.cpp` hashes passwords and makes session tokens, `main.cpp` starts the server |
| `server/tests/api_test.cpp` | Starts the server with an in-memory database and calls every route |
| `tests/` | Frontend unit tests. Files ending in `.test.ts` or `.test.tsx` run automatically |
| `.github/workflows/ci.yml` | CI: builds and tests the frontend and the backend on every push and pull request |

## Course data

- Source: the [2026-27 SCU Undergraduate Bulletin](https://www.scu.edu/appdata/pub/bulletin/undergraduate/2026-27/chapter-3-college-of-arts-and-sciences/mathematics-and-computer-science.html).
- Required 1-unit labs (for example, CSEN 20L) are folded into their course's units.
- Every prerequisite is a course in the list. The list includes the engineering courses that appear as either/or prerequisites (CSEN 10, 11, 12, 79 and ECEN 120, from the [engineering bulletin](https://www.scu.edu/bulletin/undergraduate/chapter-5-school-of-engineering/computer-science-and-engineering.html)).
- CSEN 19 is cross-listed as MATH 51, so prerequisites use MATH 51.
- CSCI 187 also names CSEN 70 (formerly COEN 70). It is no longer in the bulletin, so the list leaves it out.
- The backend seeds its database from these files on every start.

## Tech stack

- Frontend: TypeScript, React, Vite, React Router, TanStack Query, Tailwind CSS, shadcn/ui, Vitest
- Backend: C++17, [cpp-httplib](https://github.com/yhirose/cpp-httplib), [nlohmann/json](https://github.com/nlohmann/json), SQLite, [libsodium](https://doc.libsodium.org/) (password hashing), CMake
- CI: GitHub Actions
