import type { Course } from './Course';
import type { DegreeRequirement } from './DegreeRequirement';

// Courses whose code, title or description contains the search (ignoring case).
export function searchCourses(courses: readonly Course[], search: string): Course[] {
  const term = search.trim().toLowerCase();
  return courses.filter((c) => [c.code, c.title, c.description].some((text) => text.toLowerCase().includes(term)));
}

export function requirementsSatisfiedBy(requirements: readonly DegreeRequirement[], code: string): DegreeRequirement[] {
  return requirements.filter((r) => r.courses.includes(code));
}

// Courses that list `code` as a prerequisite, in any group.
export function coursesRequiring(courses: readonly Course[], code: string): Course[] {
  return courses.filter((c) => c.prerequisites.some((group) => group.includes(code)));
}
