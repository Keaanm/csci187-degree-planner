import { Course } from '../src/Course';
import { DegreeRequirement } from '../src/DegreeRequirement';
import courseData from '../src/data/courses.json';
import requirementData from '../src/data/requirements.json';

// The seed data as domain objects, so the unit tests can use the real courses and requirements.
// The app itself loads them from the API.
export const catalog: Course[] = courseData.map(
  (c) => new Course(c.code, c.title, c.description, c.units, c.prerequisites),
);

export const requirements: DegreeRequirement[] = requirementData.map(
  (r) => new DegreeRequirement(r.description, r.courses, 'count' in r ? r.count : undefined),
);

