// A course in the SCU catalog. Provides its description and prerequisite info.
//
// `prerequisites` is a list of groups: every group must be met, and a group is met by
// any one course in it. [["CSCI 60"], ["CSCI 61", "CSEN 79"]] means
// "CSCI 60, and CSCI 61 or CSEN 79".
export class Course {
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly units: number;
  readonly prerequisites: string[][];

  constructor(code: string, title: string, description: string, units: number, prerequisites: string[][] = []) {
    this.code = code;
    this.title = title;
    this.description = description;
    this.units = units;
    this.prerequisites = prerequisites;
  }
}
