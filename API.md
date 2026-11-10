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

Every degree requirement. `count` is how many of `courses` are needed. When every listed course is needed, `count` equals the number of courses.

```json
[
  {
    "requirementId": 7,
    "description": "Software emphasis: electives (two courses)",
    "count": 2,
    "courses": ["CSCI 168", "CSCI 180", "CSCI 183"]
  }
]
```

## Accounts and sessions

A student logs in with their email and password. Signing up or logging in sets an **HttpOnly** cookie called `session`, which holds a random 64-character token. The browser sends it back on every request (the frontend and backend share an origin through the Vite proxy, so `fetch` sends it with no extra options). A session lasts 30 days. Page scripts can't read the cookie, so the frontend uses `GET /api/me` to find out who is logged in.

Emails are trimmed and lowercased, so `Ana@SCU.edu` and `ana@scu.edu` are the same account. Passwords are hashed with argon2id (libsodium) and never stored or returned.

### `POST /api/signup`

Creates an account and logs it in.

```json
{ "email": "ana@scu.edu", "password": "correct horse", "startYear": 2025 }
```

Response **201**, with the session cookie set:

```json
{ "email": "ana@scu.edu", "startYear": 2025 }
```

**400** if the email isn't valid, the password is shorter than 8 or longer than 256 characters, or `startYear` isn't an integer from 2000 to 2100. **409** if the email already has an account.

### `POST /api/login`

```json
{ "email": "ana@scu.edu", "password": "correct horse" }
```

Response **200**, with the session cookie set, and the same body as sign-up. **401** `"Wrong email or password"` for an unknown email or a wrong password (the same message for both, so the response doesn't show which emails have accounts).

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

## Tables (from the ER diagram)

```sql
student             (student_id PK, email UNIQUE, password_hash, start_year)
session             (token PK, student_id, expires_at)            -- has
course              (course_id PK, code UNIQUE, title, units, description)
course_prerequisite (course_id, prerequisite_id, prereq_group)   -- requires
degree_requirement  (requirement_id PK, description, count)
course_requirement  (course_id, requirement_id, position)        -- satisfies
degree_plan         (plan_id PK, student_id, last_saved)     -- owns
plan_course         (plan_id, course_id, quarter, status, position) -- contains
```

Differences from the ER diagram, in `server/src/Database.cpp`:

- `position` keeps the order of courses within a requirement and within a plan's quarter.
- Requirement ids are the requirement's position in `requirements.json`, starting at 1.
- `expires_at` on `session` is Unix time in seconds. Expired sessions are deleted the next time anyone logs in.
- A student can own several plans in the ER diagram, but the API only uses each student's first plan for now.
- Plans saved before accounts existed had no owner, so the server drops them the first time it starts with the new tables.
- `PUT` also returns **400** for a course that isn't offered, a course listed twice, or a quarter over 18 units.

The backend seeds the database from `src/data/courses.json` and `src/data/requirements.json` on every start. Every prerequisite and requirement course must be a course in `courses.json`, or the server won't start.
