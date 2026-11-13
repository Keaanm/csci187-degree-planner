# API

CSCI 187 Group 6: Darren Hu, Henry Packer, Keaan Mirchandani, William Tran-Nguyen

The frontend (`src/api.ts`) calls these routes. The backend runs on **port 3001**. In development, Vite forwards every `/api/...` request to `http://localhost:3001`, so the frontend uses plain `/api/...` URLs.

All bodies are JSON. Errors have the body `{ "error": "<message>" }`: **400** for bad input, **401** when the route needs a login and there isn't a valid session, **404** for an unknown route, **409** for an email that already has an account, and **500** for a server error. Courses are identified by their `code` (for example `"CSCI 61"`) in the API, even though the database uses `course_id` as the key.

## `GET /api/courses`

Every offered course, with prerequisites as a list of groups: every group must be met, and a group is met by any one course in it.

```json
[
  {
    "code": "CSCI 61",
    "title": "Data Structures",
    "description": "…",
    "units": 4,
    "prerequisites": [["CSCI 60"]]
  }
]
```

A course with no prerequisites has `"prerequisites": []`. `[["CSCI 60"], ["CSCI 61", "CSEN 79"]]` means "CSCI 60, and CSCI 61 or CSEN 79".

## `GET /api/requirements`

Every degree requirement, for every program. `count` is how many of `courses` are needed. When every listed course is needed, `count` equals the number of courses. `programId` is the program it belongs to (see `GET /api/programs`). `units` is the minimum units, for the requirements the bulletin also measures in units, and otherwise `null`.

```json
[
  {
    "requirementId": 7,
    "description": "Software emphasis: electives (two courses)",
    "count": 2,
    "programId": 2,
    "units": null,
    "courses": ["CSCI 168", "CSCI 180", "CSCI 183"]
  },
  {
    "requirementId": 33,
    "description": "Core: Pathway (four courses, at least 16 units)",
    "count": 4,
    "programId": 6,
    "units": 16,
    "courses": []
  }
]
```

University Core requirements list no courses, because Core courses aren't in our catalog. Each Core area needs one course (a Pathway needs four), which will come from other credit (see "Other credit" below). Until a plan can choose its emphasis, the frontend checks only the major's requirements and the Software emphasis's.

The data follows the 2026-27 SCU Undergraduate Bulletin (College of Arts and Sciences, B.S. in Computer Science), with these simplifications:

- Labs (such as CSEN 146L) are counted in their course's units, not listed separately.
- Electives list only the courses the bulletin names. Its "or any other upper-division CSCI course below 190 or CSEN course below 188" option isn't modeled yet.
- Prerequisites only name courses in our catalog. For example, CSCI 164's "CSCI 163 or CSEN 179" is just CSCI 163, and MATH 175 has none, because MATH 52 isn't in the catalog.
- The Core areas follow the bulletin's list for Arts and Sciences students, for students who start as first-years.

## Accounts and sessions

A student logs in with their email and password. Signing up or logging in sets an **HttpOnly** cookie called `session`, which holds a random 64-character token. The browser sends it back on every request (the frontend and backend share an origin through the Vite proxy, so `fetch` sends it with no extra options). A session lasts 30 days. Page scripts can't read the cookie, so the frontend uses `GET /api/me` to find out who is logged in.

Emails are trimmed and lowercased, so `Ana@SCU.edu` and `ana@scu.edu` are the same account. Passwords are hashed with argon2id (libsodium) and never stored or returned.

Sign-up, login and `PUT` need `Content-Type: application/json` (**400** otherwise). A form on another site can only send form or plain-text bodies, so this stops it from logging a visitor into someone else's account.

### `POST /api/signup`

Creates an account and logs it in.

```json
{ "email": "ana@scu.edu", "password": "correct horse", "startYear": 2025 }
```

Response **201**, with the session cookie set:

```json
{ "email": "ana@scu.edu", "startYear": 2025 }
```

**400** if the email isn't valid (one `@`, a domain with a dot, at most 254 bytes, no spaces or control characters), the password is shorter than 8 or longer than 256 bytes, or `startYear` isn't an integer from 2000 to 2100. **409** if the email already has an account.

### `POST /api/login`

```json
{ "email": "ana@scu.edu", "password": "correct horse" }
```

Response **200**, with the session cookie set, and the same body as sign-up. **401** `"Wrong email or password"` for an unknown email or a wrong password (the same message for both, so the response doesn't show which emails have accounts). **400** if the body has no string `email` or `password`. Logging in ends the session the browser already had, if any.

### `POST /api/logout`

Ends the session and clears the cookie. Response **204** with no body, even when already logged out.

### `GET /api/me`

The logged-in student:

```json
{ "email": "ana@scu.edu", "startYear": 2025 }
```

**401** if not logged in or the session has expired. The frontend sends the student to the login page then.

## `GET /api/me/plan`

The logged-in student's plan. There's no plan id in the URL, so a student can only reach their own plan. Quarters are numbered 0 to 11 (0 = Year 1 Fall, 11 = Year 4 Spring). `status` is `"planned"` or `"completed"`. Courses come back in the order they were added within each quarter.

```json
{
  "planId": 1,
  "lastSaved": "2026-10-30T20:00:00.000Z",
  "courses": [
    { "code": "CSCI 10", "quarter": 0, "status": "completed" },
    { "code": "CSCI 60", "quarter": 1, "status": "planned" }
  ]
}
```

**404** if the student has never saved a plan. The frontend then starts with an empty plan. **401** if not logged in.

## `PUT /api/me/plan`

Saves the logged-in student's whole plan, replacing every course saved before. Creates the plan on the first save. **401** if not logged in.

Request body:

```json
{
  "courses": [
    { "code": "CSCI 10", "quarter": 0, "status": "completed" }
  ]
}
```

Response: the plan id and the new last-saved time (ISO 8601).

```json
{ "planId": 1, "lastSaved": "2026-10-30T21:00:00.000Z" }
```

Return **400** if the body isn't in this shape. The frontend shows an error for any non-2xx response.

## Several plans

A student can have several plans, for example a copy to try a "what if". Every route here needs a login (**401** without one). A plan id that isn't one of the logged-in student's plans is a **404**, the same as one that doesn't exist, so a student can't find out which plan ids exist. `POST`, `PATCH` and `PUT` need `Content-Type: application/json`.

### `GET /api/me/plans`

The student's plans, oldest first. `programId` is the emphasis the plan follows, or `null` until one is chosen. `shared` is `false` until share links are built.

```json
[{ "planId": 3, "name": "Main plan", "programId": 2, "lastSaved": "2026-11-12T18:00:00.000Z", "shared": false }]
```

A plan saved before several plans existed is named "Main plan", with `programId: null`.

### `POST /api/me/plans`

Creates a plan. `programId` and `copyFrom` are optional. With `copyFrom`, the new plan starts with a copy of that plan's courses.

```json
{ "name": "What if I study abroad", "programId": 2, "copyFrom": 3 }
```

Response **201** with the new plan, in the same shape as the list. The name is trimmed. **400** for a missing or empty name, one over 60 characters (each UTF-8 character counts once), or a `programId` that isn't an emphasis (`null` is fine). **404** if `copyFrom` isn't one of the student's plans.

### `PATCH /api/me/plans/:planId`

Renames a plan or changes its emphasis. Body: `{ "name": "...", "programId": 2 }`, either field optional; `"programId": null` clears the emphasis. Response **200** with the plan. **400** for the same bad values as `POST`; nothing changes then.

### `DELETE /api/me/plans/:planId`

Deletes a plan and its courses. Response **204**. **400** `"You need at least one plan"` for the student's only plan. The frontend asks before deleting.

### `GET` and `PUT /api/me/plans/:planId`

Load and save one plan, with the same bodies and errors as `GET` and `PUT /api/me/plan`.

## `GET /api/programs`

Every program: the major, its emphases and the University Core. `kind` is `"major"`, `"emphasis"` or `"core"`. A plan's requirements are the major's, its emphasis's, and the Core's. **401** if not logged in.

```json
[
  { "programId": 1, "name": "Computer Science (B.S.)", "kind": "major" },
  { "programId": 2, "name": "Software", "kind": "emphasis" },
  { "programId": 3, "name": "Algorithms and Complexity", "kind": "emphasis" },
  { "programId": 4, "name": "Data Science", "kind": "emphasis" },
  { "programId": 5, "name": "Security", "kind": "emphasis" },
  { "programId": 6, "name": "University Core", "kind": "core" }
]
```

Program ids are the program's position in `src/data/programs.json`, starting at 1, and stay the same when the server reseeds.

## Next routes (agreed, not built yet)

These are the routes for the rest of the final project, agreed before anyone builds them, so the backend and frontend can be built at the same time. Move each one into the sections above (and remove this note from it) in the pull request that builds it.

Schema changes must keep existing students and plans: add columns with `ALTER TABLE ... ADD COLUMN`, or copy into a new table and rename it. Don't drop a table that holds student data (the drop for pre-account plans was only safe because no student could reach them). Every route here needs a login (**401** without one), and a plan id that isn't one of the logged-in student's plans is a **404**, so a student can't find out which plan ids exist.

### Several plans (due Sun Nov 15)

The routes are built (see "Several plans" above), and the frontend uses them; it no longer calls `/api/me/plan`, so that route can be removed. Still to do: sign-up creates the first plan, called "Main plan", with no emphasis chosen (`programId: null`), and students who signed up before this (and may have no plan yet) get a "Main plan" when the server starts, so every student always has at least one. Until then, the frontend makes a "Main plan" itself (`POST /api/me/plans`) when the list is empty.

### Finished quarters and retakes (due Thu Nov 19)

`GET /api/me` adds `confirmedThrough`: the last quarter (0 to 11) whose results the student has confirmed, or `null`.

`PATCH /api/me` with `{ "confirmedThrough": 2, "planId": 3 }` records that the student confirmed every quarter up to and including that one, using plan 3's courses and passed/failed results. The past is the same in every plan, so the server copies those quarters (courses and results) into the student's other plans. **400** for a quarter that hasn't ended yet. A quarter ends on Dec 15 (Fall), Mar 25 (Winter) or Jun 15 (Spring) of its school year, using the server's date.

A plan course's `status` can also be `"failed"` (didn't pass or withdrew). A failed course doesn't count toward anything, and the same course can then be planned again in a later quarter, so a course can be in a plan more than once if every earlier attempt is failed. This replaces today's 400 for "a course listed twice": `PUT` still rejects a course listed twice unless every earlier attempt is `"failed"`. `plan_course` needs a new key (`plan_id, course_id, quarter`) and the new status, so it's rebuilt with a copy, keeping every saved row.

### Other credit (due Sun Nov 22)

`GET /api/me/plans/:planId` adds `credits`, and `PUT` accepts it: units that aren't courses in our catalog. A `PUT` with `credits` replaces them all; a `PUT` without `credits` leaves them as they are.

```json
{ "credits": [{ "kind": "ap", "description": "AP Calculus BC", "units": 8, "requirementId": null }] }
```

`kind` is `"core"`, `"elective"`, `"ap"`, `"transfer"` or `"abroad"`. `requirementId` is the requirement it counts toward, or `null`. **400** for units that aren't 1 to 60. Each credit counts as one course toward its requirement, so one credit meets a Core area. A Pathway also needs its credits to add up to its `units`.

### Share link (due Sun Nov 22)

`POST /api/me/plans/:planId/share` turns on a read-only link and returns `{ "shareToken": "<64 hex characters>" }`. Calling it again returns the same token. `DELETE` on the same route turns the link off (**204**), and the old link stops working.

`GET /api/shared/:shareToken` needs no login and returns the plan: its `courses`, `credits`, `lastSaved`, `name`, `programId` (so the right emphasis's requirements show), and the owner's `startYear`, but not their email or the plan id. **404** for a token that doesn't exist or was turned off.

## Tables (from the ER diagram)

```sql
student             (student_id PK, email UNIQUE, password_hash, start_year)
session             (token PK, student_id, expires_at)            -- has
course              (course_id PK, code UNIQUE, title, units, description)
course_prerequisite (course_id, prerequisite_id, prereq_group)   -- requires
degree_requirement  (requirement_id PK, description, count, program_id, units)
program             (program_id PK, name, kind)
course_requirement  (course_id, requirement_id, position)        -- satisfies
degree_plan         (plan_id PK, student_id, last_saved)     -- owns
plan_course         (plan_id, course_id, quarter, status, position) -- contains
```

Differences from the ER diagram, in `server/src/Database.cpp`:

- `position` keeps the order of courses within a requirement and within a plan's quarter.
- Requirement ids are the requirement's position in `requirements.json`, starting at 1.
- `expires_at` on `session` is Unix time in seconds. Expired sessions are deleted the next time anyone logs in or signs up.
- `GET` and `PUT /api/me/plan` use the student's first plan (the oldest).
- `degree_plan` also has `name` and `program_id` (the emphasis, or NULL). They were added with `ALTER TABLE`, so plans saved before them are kept and named "Main plan".
- Plans saved before accounts existed had no owner, so the server drops them the first time it starts with the new tables.
- `PUT` also returns **400** for a course that isn't offered, a course listed twice, or a quarter over 18 units.

The backend seeds the database from `src/data/courses.json`, `src/data/requirements.json` and `src/data/programs.json` on every start. Every prerequisite and requirement course must be a course in `courses.json`, or the server won't start.
