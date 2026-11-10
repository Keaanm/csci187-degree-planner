# Functional Specifications

CSCI 187 Group 6: Darren Hu, Henry Packer, Keaan Mirchandani, William Tran-Nguyen

These specifications cover the MVP. The plan logic lives in `src/DegreePlan.ts`, the pages are in `src/pages/`, and the backend that saves the plan is in `server/` (routes in [API.md](API.md)).

## The plan

- A plan has 12 quarters: Fall, Winter and Spring for each of 4 years.
- Courses come from the preloaded list in `src/data/courses.json`. Requirements come from `src/data/requirements.json`. The backend seeds its SQLite database from these files.
- Each course in the plan is either planned or completed.

## Specifications

1. **Only accept classes that are actually offered.**
   A course can only be added if it is in the course list. The search when adding a course only shows offered courses that aren't already in the plan, and the plan rejects any other course code with an error. A course can only be in the plan once. The backend also rejects a save with a course that isn't offered or is listed twice.

2. **Only accept a max of 18 units per quarter.**
   If adding a course would put a quarter over 18 units, the course is not added and an error is shown under that quarter until the plan changes. A quarter with exactly 18 units is allowed. The backend also rejects a save with a quarter over 18 units.

3. **Warn when the user adds a class that needs a prerequisite done first.**
   A prerequisite only counts if it is planned in an earlier quarter. If it is missing, in the same quarter, or in a later quarter, the course shows a warning that lists the missing prerequisites. When a prerequisite can be met by one of several courses (for example, CSCI 61 or CSEN 79), any one of them is enough. The course is still added, so the student can fix the order.

4. **When the user clicks a button, the plan is saved.**
   Clicking "Save plan" saves the whole plan, including which courses are completed, to the database. The button is at the top of the plan page and stays there while scrolling. Next to it, the page shows whether there are unsaved changes and when the plan was last saved. Closing the tab with unsaved changes asks first. When the student comes back, the saved plan is loaded. If nothing is saved yet, the student starts with an empty plan. Saved courses that are no longer offered are skipped. If the server can't be reached, the page says so and offers to try again. There are no accounts in the MVP, so the app always uses plan 1: everyone using the same server shares one plan, and saving replaces it.

5. **Show which degree requirements the planned courses satisfy.**
   The plan page has a requirements panel that stays beside the plan. Each requirement is marked completed (the completed courses meet it), covered by your plan (the planned and completed courses meet it), or not covered. A requirement that isn't covered lists the courses that would meet it, and each has a button that adds it to a quarter the student picks. Some requirements need every listed course, and others need a set number of them (for example, 2 of 5 electives).

6. **Record completed courses.**
   Each course in the plan has a circle next to it. Clicking it marks the course completed (a green check), and clicking again marks it planned. Only courses in the plan can be marked completed. Removing a course from the plan also clears its completed mark.

7. **Show degree progress from completed courses.**
   A summary at the top of the plan page shows units completed and units planned out of the units the Software emphasis requirements need (for a "choose N" requirement, the N courses with the fewest units), how many are not planned yet, and how many requirements are completed and how many more the plan covers. A new student with an empty plan is told to start by adding the courses they have already taken.

8. **Look up courses.**
   The course lookup page lists every offered course and filters it by code, title or description as the student types. Each course shows whether it is in the plan or completed.

9. **Show course details.**
   Each course has a page with its title, units, description, prerequisites (either/or groups shown with "or"), the degree requirements it counts toward, and the courses it is a prerequisite for. Prerequisites and the courses it is a prerequisite for link to their own pages.
