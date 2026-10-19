import type { Course } from './Course';
import type { DegreeRequirement } from './DegreeRequirement';
import { findCourse } from './catalog';

export const YEARS = 4;
export const TERMS = ['Fall', 'Winter', 'Spring'] as const;
export const QUARTER_COUNT = YEARS * TERMS.length;
export const MAX_UNITS_PER_QUARTER = 18;

// Label for a quarter index, e.g. 0 -> "Year 1 Fall", 4 -> "Year 2 Winter".
export function quarterLabel(quarter: number): string {
  const year = Math.floor(quarter / TERMS.length) + 1;
  return `Year ${year} ${TERMS[quarter % TERMS.length]}`;
}

export interface PrerequisiteWarning {
  course: Course;
  quarter: number;
  // Unmet prerequisite groups; any one course in a group would meet it.
  missing: string[][];
}

export interface RequirementStatus {
  requirement: DegreeRequirement;
  satisfied: boolean;
  stillNeeded: number;
  missing: string[];
}

// A student's 4-year plan: the courses planned in each quarter.
// Immutable: methods that change the plan return a new DegreePlan.
export class DegreePlan {
  readonly quarters: readonly (readonly Course[])[];

  constructor(quarters?: readonly (readonly Course[])[]) {
    this.quarters = quarters ?? Array.from({ length: QUARTER_COUNT }, () => []);
  }

  coursesIn(quarter: number): readonly Course[] {
    this.checkQuarter(quarter);
    return this.quarters[quarter];
  }

  hasCourse(code: string): boolean {
    return this.quarters.some((q) => q.some((c) => c.code === code));
  }

  // Adds an offered course to a quarter. Throws if the course isn't offered, is already
  // in the plan, or would put the quarter over MAX_UNITS_PER_QUARTER.
  addCourse(quarter: number, code: string): DegreePlan {
    this.checkQuarter(quarter);
    const course = findCourse(code);
    if (!course) {
      throw new Error(`${code} is not an offered course`);
    }
    if (this.hasCourse(code)) {
      throw new Error(`${code} is already in the plan`);
    }
    if (this.unitsIn(quarter) + course.units > MAX_UNITS_PER_QUARTER) {
      throw new Error(`${quarterLabel(quarter)} can't have more than ${MAX_UNITS_PER_QUARTER} units`);
    }
    return this.withQuarter(quarter, [...this.quarters[quarter], course]);
  }

  removeCourse(quarter: number, code: string): DegreePlan {
    this.checkQuarter(quarter);
    return this.withQuarter(quarter, this.quarters[quarter].filter((c) => c.code !== code));
  }

  unitsIn(quarter: number): number {
    return this.coursesIn(quarter).reduce((sum, c) => sum + c.units, 0);
  }

  totalUnits(): number {
    return this.quarters.reduce((sum, _, i) => sum + this.unitsIn(i), 0);
  }

  // Courses placed before (or in the same quarter as) one of their prerequisites,
  // or whose prerequisite isn't in the plan at all.
  prerequisiteWarnings(): PrerequisiteWarning[] {
    const warnings: PrerequisiteWarning[] = [];
    const takenBefore = new Set<string>();
    this.quarters.forEach((courses, quarter) => {
      for (const course of courses) {
        const missing = course.prerequisites.filter((group) => !group.some((p) => takenBefore.has(p)));
        if (missing.length > 0) warnings.push({ course, quarter, missing });
      }
      for (const course of courses) takenBefore.add(course.code);
    });
    return warnings;
  }

  requirementStatus(requirements: readonly DegreeRequirement[]): RequirementStatus[] {
    const planned = this.courseCodes();
    return requirements.map((requirement) => {
      const stillNeeded = requirement.stillNeeded(planned);
      return { requirement, satisfied: stillNeeded === 0, stillNeeded, missing: requirement.missingCourses(planned) };
    });
  }

  courseCodes(): string[] {
    return this.quarters.flatMap((q) => q.map((c) => c.code));
  }

  // Course codes per quarter, for saving.
  toJSON(): string[][] {
    return this.quarters.map((q) => q.map((c) => c.code));
  }

  // Rebuilds a plan from saved course codes. Skips any course that can't be added
  // (no longer offered, duplicate, or over the unit limit).
  static fromJSON(saved: unknown): DegreePlan {
    let plan = new DegreePlan();
    if (!Array.isArray(saved)) return plan;
    saved.slice(0, QUARTER_COUNT).forEach((codes, quarter) => {
      if (!Array.isArray(codes)) return;
      for (const code of codes) {
        try {
          plan = plan.addCourse(quarter, String(code));
        } catch {
          // Skip courses that are no longer valid.
        }
      }
    });
    return plan;
  }

  private withQuarter(quarter: number, courses: Course[]): DegreePlan {
    return new DegreePlan(this.quarters.map((q, i) => (i === quarter ? courses : q)));
  }

  private checkQuarter(quarter: number): void {
    if (!Number.isInteger(quarter) || quarter < 0 || quarter >= QUARTER_COUNT) {
      throw new RangeError(`Quarter must be an integer from 0 to ${QUARTER_COUNT - 1}`);
    }
  }
}
