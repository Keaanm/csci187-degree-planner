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
   If adding a course would put a quarter over 18 units, the course is not added and an error is shown. A quarter with exactly 18 units is allowed.

3. **Warn when the user adds a class that needs a prerequisite done first.**
   A prerequisite only counts if it is planned in an earlier quarter. If it is missing, in the same quarter, or in a later quarter, the course shows a warning that lists the missing prerequisites. When a prerequisite can be met by one of several courses (for example, CSCI 61 or CSEN 79), any one of them is enough. The course is still added, so the student can fix the order.

4. **When the user clicks a button, the plan is saved.**
   Clicking "Save plan" saves the whole plan, including which courses are completed, to the database. The button is on every page, which shows whether there are unsaved changes and when the plan was last saved. Closing the tab with unsaved changes asks first. When the student comes back, the saved plan is loaded. If nothing is saved yet, the student starts with an empty plan. Saved courses that are no longer offered are skipped. If the server can't be reached, the page says so and offers to try again.

5. **Show which degree requirements the planned courses satisfy.**
   The page lists each degree requirement and marks whether the planned courses satisfy it. If not, it shows what is still needed. Some requirements need every listed course, and others need a set number of them (for example, 2 of 5 electives).

6. **Record completed courses.**
   Each course in the plan has a "Completed" checkbox. Only courses in the plan can be marked completed. Removing a course from the plan also clears its completed mark.

7. **Show degree progress from completed courses.**
   The progress page counts only completed courses. It shows units completed out of the 175 needed to graduate and how many remain, which requirements are completed and which remain (with what is still needed), and the list of completed courses with their quarters.

8. **Look up courses.**
   The course lookup page lists every offered course and filters it by code, title or description as the student types. Each course shows whether it is in the plan or completed.

9. **Show course details.**
   Each course has a page with its title, units, description, prerequisites (either/or groups shown with "or"), the degree requirements it counts toward, and the courses it is a prerequisite for. Prerequisites and requirement courses link to their own pages.
