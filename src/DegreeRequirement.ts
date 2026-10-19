// A degree requirement, satisfied when enough of the courses it lists have been taken
// or planned. By default every listed course is needed; `count` allows "choose N of these".
export class DegreeRequirement {
  readonly description: string;
  readonly courses: string[];
  readonly count: number;

  constructor(description: string, courses: string[], count: number = courses.length) {
    this.description = description;
    this.courses = courses;
    this.count = count;
  }

  isSatisfiedBy(codes: Iterable<string>): boolean {
    return this.stillNeeded(codes) === 0;
  }

  // How many more of the listed courses are needed.
  stillNeeded(codes: Iterable<string>): number {
    const have = new Set(codes);
    const taken = this.courses.filter((c) => have.has(c)).length;
    return Math.max(0, this.count - taken);
  }

  // Listed courses that haven't been taken or planned yet.
  missingCourses(codes: Iterable<string>): string[] {
    const have = new Set(codes);
    return this.courses.filter((c) => !have.has(c));
  }
}
