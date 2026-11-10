import type { Course } from './Course';
import type { DegreeRequirement } from './DegreeRequirement';

// The offered courses and the degree requirements, and the lookups across them.
export class Catalog {
  readonly courses: readonly Course[];
  readonly requirements: readonly DegreeRequirement[];

  constructor(courses: readonly Course[], requirements: readonly DegreeRequirement[]) {
    this.courses = courses;
    this.requirements = requirements;
  }

  find(code: string): Course | undefined {
    return this.courses.find((c) => c.code === code);
  }

  // Courses whose code, title or description contains the search (ignoring case).
  search(search: string): Course[] {
    const term = search.trim().toLowerCase();
    return this.courses.filter((c) => [c.code, c.title, c.description].some((text) => text.toLowerCase().includes(term)));
  }

  requirementsSatisfiedBy(code: string): DegreeRequirement[] {
    return this.requirements.filter((r) => r.courses.includes(code));
  }

  // Courses that list `code` as a prerequisite, in any group.
  coursesRequiring(code: string): Course[] {
    return this.courses.filter((c) => c.prerequisites.some((group) => group.includes(code)));
  }
}
