# Functional Specifications

CSCI 187 Group 6: Darren Hu, Henry Packer, Keaan Mirchandani, William Tran-Nguyen

These specifications cover what is built so far, and change as we build the final project. The plan logic lives in `src/DegreePlan.ts`, the pages are in `src/pages/`, and the backend that saves the plan is in `server/` (routes in [API.md](API.md)).

## The plan

- A plan has 12 quarters: Fall, Winter and Spring for each of 4 years.
- Courses come from the preloaded list in `src/data/courses.json`. Requirements come from `src/data/requirements.json`. The backend seeds its SQLite database from these files.
- Each course in the plan is either planned or completed.

## Specifications

1. **Only accept classes that are actually offered.**
   A course can only be added if it is in the course list. The search when adding a course only shows offered courses that aren't already in the plan, and the plan rejects any other course code with an error. A course can only be in the plan once. The backend also rejects a save with a course that isn't offered or is listed twice.

2. **Only accept a max of 18 units per quarter.**
   If adding a course would put a quarter over 18 units, the course is not added and an error is shown: under that quarter until the plan changes, or, when adding from the requirements panel, in the quarter menu until it closes. A quarter with exactly 18 units is allowed. The backend also rejects a save with a quarter over 18 units.

3. **Warn when the user adds a class that needs a prerequisite done first.**
   A prerequisite only counts if it is planned in an earlier quarter. If it is missing, in the same quarter, or in a later quarter, the course shows a warning that lists the missing prerequisites. When a prerequisite can be met by one of several courses (for example, CSCI 61 or CSEN 79), any one of them is enough. The course is still added, so the student can fix the order.

4. **The plan saves automatically.**
   About a second after the student stops editing, the whole plan, including which courses are completed, is saved to the database. There is no Save button. Only one save runs at a time, and edits made during a save are saved right after it. A status at the top of the plan page stays in view while scrolling and shows "Unsaved changes", "Saving…", or when the plan was last saved. Undoing every edit before it saves counts as saved, and nothing is sent. If saving fails, the page shows why (or that the server can't be reached), keeps the edits, and offers "Try again"; it doesn't retry on its own until the plan changes again, and the message goes away when it does. Closing the tab with unsaved changes asks first. When the student comes back, the saved plan is loaded. If nothing is saved yet, the student starts with an empty plan. Saved courses that are no longer offered are skipped. If the server can't be reached on load, the page says so and offers to try again. Each student's plan is saved to their own account (spec 10).

5. **Show which degree requirements the planned courses satisfy.**
   The plan page has a requirements panel that stays beside the plan on wide screens (on narrow screens it comes after the plan). Each requirement is marked completed (the completed courses meet it), covered by your plan (the planned and completed courses meet it), or not covered. A requirement that isn't covered lists the courses that would meet it, and each has a button that adds it to a quarter the student picks. Some requirements need every listed course, and others need a set number of them (for example, 2 of 5 electives).

6. **Record completed courses.**
   Each course in the plan has a circle next to it. Clicking it marks the course completed (a green check), and clicking again marks it planned. Only courses in the plan can be marked completed. Removing a course from the plan also clears its completed mark.

7. **Show degree progress from completed courses.**
   A summary at the top of the plan page shows units completed and units planned out of the units the Software emphasis requirements need (for a "choose N" requirement, the N courses with the fewest units), how many are not planned yet, and how many requirements are completed and how many more the plan covers. A new student with an empty plan is told to start by adding the courses they have already taken.

8. **Look up courses.**
   The course lookup page lists every offered course and filters it by code, title or description as the student types. The search stays in the page address, so "All courses" on a course page goes back to the same results. Each course shows whether it is in the plan or completed.

9. **Show course details.**
   Each course has a page with its title, units, description, prerequisites (either/or groups shown with "or"), the degree requirements it counts toward, and the courses it is a prerequisite for. Prerequisites and the courses it is a prerequisite for link to their own pages.

10. **Students have their own accounts.**
   Every page needs a login. A student who isn't logged in only sees the login page and the sign-up page; any other address goes to the login page, and after logging in or signing up they land on the page they first asked for. After someone logs out on purpose, the next person to log in starts on My Plan instead. Signing up asks for an email, a password of at least 8 characters, and the fall quarter they started at SCU (saved now; the final project uses it to tell which quarters have ended). The start quarter must be chosen before the form is sent. The server's message is shown when signing up or logging in fails: an invalid email, a short password, an email that already has an account, or a wrong email or password (the same message for both, so the app doesn't reveal which emails have accounts). Emails ignore case and surrounding spaces. The header shows the logged-in email and a Log out button. Logging out while changes are still saving asks first: the student can wait, and is logged out as soon as they save, or log out now and lose them. If the changes failed to save, it warns that they'll be lost. A student only ever sees and saves their own plan, and logging in as a different student never shows the last student's plan. A login lasts 30 days. If it ends while the app is open (it expired, or the student logged out in another tab), the next request sends the student to the login page, which says why. Edits that hadn't saved yet are lost in that case; this is the one exception to spec 4 keeping edits when a save fails. Sign-up, login and saving only accept JSON requests, so another site can't submit a form that logs a visitor into someone else's account.
