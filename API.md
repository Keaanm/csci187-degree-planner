# API

CSCI 187 Group 6: Darren Hu, Henry Packer, Keaan Mirchandani, William Tran-Nguyen

The frontend (`src/api.ts`) calls these routes. The backend runs on **port 3001**. In development, Vite forwards every `/api/...` request to `http://localhost:3001`, so the frontend uses plain `/api/...` URLs.

All bodies are JSON. Courses are identified by their `code` (for example `"CSCI 61"`) in the API, even though the database uses `course_id` as the key.

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

## `GET /api/plans/:planId`

A saved plan. Quarters are numbered 0 to 11 (0 = Year 1 Fall, 11 = Year 4 Spring). `status` is `"planned"` or `"completed"`. Return courses in the order they were added within each quarter.

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

Return **404** if the plan has never been saved. The frontend then starts with an empty plan.

## `PUT /api/plans/:planId`

Saves the whole plan, replacing every course saved for that plan before. Creates the plan if it doesn't exist yet.

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
course              (course_id PK, code UNIQUE, title, units, description)
course_prerequisite (course_id, prerequisite_id, prereq_group)   -- requires
degree_requirement  (requirement_id PK, description, count)
course_requirement  (course_id, requirement_id)                  -- satisfies
degree_plan         (plan_id PK, last_saved)
plan_course         (plan_id, course_id, quarter, status)        -- contains
```

`src/data/courses.json` and `src/data/requirements.json` can be used as seed data. The frontend still uses those files to check the plan's rules (offered courses, unit limit), so keep the database seeded from them.
