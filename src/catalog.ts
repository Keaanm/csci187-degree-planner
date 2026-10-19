import { Course } from './Course';
import { DegreeRequirement } from './DegreeRequirement';
import courseData from './data/courses.json';
import requirementData from './data/requirements.json';

// The hard-coded list of offered courses. Only these can be added to a plan.
export const catalog: Course[] = courseData.map(
  (c) => new Course(c.code, c.title, c.description, c.units, c.prerequisites),
);

export const requirements: DegreeRequirement[] = requirementData.map(
  (r) => new DegreeRequirement(r.description, r.courses, 'count' in r ? r.count : undefined),
);

export function findCourse(code: string): Course | undefined {
  return catalog.find((c) => c.code === code);
}
