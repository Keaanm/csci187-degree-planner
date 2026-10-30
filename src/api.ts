import { Course } from './Course';
import { DegreePlan } from './DegreePlan';
import type { PlanCourse } from './DegreePlan';
import { DegreeRequirement } from './DegreeRequirement';

// Talks to the backend. The routes and JSON shapes are described in API.md.
// There are no accounts in the MVP, so the app always uses plan 1.
export const PLAN_ID = 1;

type Fetch = typeof fetch;

interface CourseJson {
  code: string;
  title: string;
  description: string;
  units: number;
  prerequisites: string[][];
}

interface RequirementJson {
  requirementId: number;
  description: string;
  count: number;
  courses: string[];
}

interface PlanJson {
  planId: number;
  lastSaved: string | null;
  courses: PlanCourse[];
}

export interface LoadedPlan {
  plan: DegreePlan;
  lastSaved: string | null;
}

export async function fetchCourses(fetchFn: Fetch = fetch): Promise<Course[]> {
  const courses = await getJson<CourseJson[]>(fetchFn, '/api/courses');
  return courses.map((c) => new Course(c.code, c.title, c.description, c.units, c.prerequisites));
}

export async function fetchRequirements(fetchFn: Fetch = fetch): Promise<DegreeRequirement[]> {
  const requirements = await getJson<RequirementJson[]>(fetchFn, '/api/requirements');
  return requirements.map((r) => new DegreeRequirement(r.description, r.courses, r.count));
}

// Loads a saved plan. A plan that hasn't been saved yet (404) loads as an empty plan.
export async function fetchPlan(planId: number = PLAN_ID, fetchFn: Fetch = fetch): Promise<LoadedPlan> {
  const response = await fetchFn(`/api/plans/${planId}`);
  if (response.status === 404) return { plan: new DegreePlan(), lastSaved: null };
  const saved = await readJson<PlanJson>(response);
  return { plan: DegreePlan.fromRows(saved.courses), lastSaved: saved.lastSaved };
}

// Saves the whole plan, replacing what was saved before. Returns the new last-saved time.
export async function savePlan(plan: DegreePlan, planId: number = PLAN_ID, fetchFn: Fetch = fetch): Promise<string> {
  const response = await fetchFn(`/api/plans/${planId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courses: plan.toRows() }),
  });
  const saved = await readJson<{ planId: number; lastSaved: string }>(response);
  return saved.lastSaved;
}

async function getJson<T>(fetchFn: Fetch, url: string): Promise<T> {
  return readJson<T>(await fetchFn(url));
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`The server returned ${response.status} for ${response.url || 'a request'}`);
  }
  return (await response.json()) as T;
}
