# Functional Specifications

CSCI 187 Group 6: Darren Hu, Henry Packer, Keaan Mirchandani, William Tran-Nguyen

These specifications cover the walking skeleton (the 4-year plan). The logic lives in `src/DegreePlan.ts` and `src/planStorage.ts`, and the page is `src/pages/PlanPage.tsx`.

## The plan

- A plan has 12 quarters: Fall, Winter and Spring for each of 4 years.
- Courses come from the preloaded list in `src/data/courses.json`. Requirements come from `src/data/requirements.json`.

## Specifications

1. **Only accept classes that are actually offered.**
   A course can only be added if it is in the course list. The page only offers courses from the list, and the plan rejects any other course code with an error. A course can only be in the plan once.

2. **Only accept a max of 18 units per quarter.**
   If adding a course would put a quarter over 18 units, the course is not added and an error is shown. A quarter with exactly 18 units is allowed.

3. **Warn when the user adds a class that needs a prerequisite done first.**
   A prerequisite only counts if it is planned in an earlier quarter. If it is missing, in the same quarter, or in a later quarter, the course shows a warning that lists the missing prerequisites. When a prerequisite can be met by one of several courses (for example, CSCI 61 or CSEN 79), any one of them is enough. The course is still added, so the student can fix the order.

4. **When the user clicks a button, the plan is saved.**
   Clicking "Save plan" saves the plan in the browser (localStorage). The page shows whether there are unsaved changes. When the student comes back, the saved plan is loaded. If nothing is saved, or the saved data can't be read, the student starts with an empty plan. Saved courses that are no longer offered are skipped.

## Requirement status

The page lists each degree requirement and shows whether the planned courses satisfy it. If not, it shows what is still needed. Some requirements need every listed course, and others need a set number of them (for example, 2 of 5 electives).
