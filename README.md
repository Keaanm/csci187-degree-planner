# SCU CS Degree Planner

CSCI 187 Group 6: Darren Hu, Henry Packer, Keaan Mirchandani, William Tran-Nguyen

A course planning and degree progress tool for Santa Clara University Computer Science undergraduates. Today, students plan by hand from PDF requirement sheets, Workday, and their own spreadsheets. They trace prerequisites themselves and check off requirements manually. With this tool, students can build a 4-year plan and see their progress toward their degree requirements.

The MVP covers the Computer Science major. Our team preloads the course and requirement data, starting with the Software emphasis. There are no accounts. The plan is saved in the browser with localStorage.

The full requirements are in [REQUIREMENTS.md](REQUIREMENTS.md), and the functional specifications are in [SPECIFICATIONS.md](SPECIFICATIONS.md).

## User requirements (MVP)

The user should be able to:

### Tracking progress
1. Record which courses they have completed
2. Select their Computer Science emphasis
3. See which degree requirements they have completed and which remain
4. See how many units they have completed and how many remain

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
Requirement data for the other CS emphases, the CS minor, the University Core, other majors, accounts (student and advisor), transfer credit, courses that count toward multiple requirements, the quarters a course is usually offered, professor ratings, all quarter schedule features (upcoming quarter search, time filters, conflict warnings, comparing schedules, backup classes, alternative courses), starting from the department's sample plan, a check for graduating by the expected quarter, replanning when a course becomes unavailable, study abroad paths, PDF export, and advisor features (sharing, viewing student plans, recommendations).

## Setup

Requirements: [Node.js](https://nodejs.org/) 22.12 or newer (current LTS recommended) and git.

```sh
git clone https://github.com/Keaanm/csci187-degree-planner.git
cd csci187-degree-planner
npm install
npm run dev      # start the dev server at http://localhost:5173
```

Other commands:

```sh
npm test         # run the unit tests once (Vitest)
npm run build    # type-check and build for production
npm run lint     # lint with oxlint
```

## Project layout

- `src/` contains the app source. The domain logic (`DegreePlan`, `DegreeRequirement`, `Course`) lives here as plain TypeScript, kept apart from React so it can be unit tested.
- `src/data/` holds the preloaded course and requirement data for the B.S. in Computer Science (College of Arts and Sciences, Software emphasis), taken from the [2026-27 SCU Undergraduate Bulletin](https://www.scu.edu/appdata/pub/bulletin/undergraduate/2026-27/chapter-3-college-of-arts-and-sciences/mathematics-and-computer-science.html). Required 1-unit labs (e.g. CSEN 20L) are folded into their course's units.
- `src/App.tsx` defines the routes: `/` (degree progress), `/plan` (4-year plan), `/courses` (course lookup), `/courses/:code` (one course), and `/setup` (choose an emphasis and record completed courses).
- `tests/` contains the unit tests. Any file ending in `.test.ts` runs automatically.
- `.github/workflows/ci.yml` runs on every push and pull request. It installs dependencies, builds, and runs the tests.

## Tech stack

TypeScript, React, Vite, React Router, Vitest, and GitHub Actions.
