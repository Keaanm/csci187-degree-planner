import { Course } from './Course';
import { DegreeRequirement } from './DegreeRequirement';
import courseData from './data/courses.json';
import requirementData from './data/requirements.json';

// The seed data as domain objects. The app loads courses and requirements from the API;
// this is DegreePlan's default course list, used by the unit tests.
export const catalog: Course[] = courseData.map(
  (c) => new Course(c.code, c.title, c.description, c.units, c.prerequisites),
);

export const requirements: DegreeRequirement[] = requirementData.map(
  (r) => new DegreeRequirement(r.description, r.courses, 'count' in r ? r.count : undefined),
);

