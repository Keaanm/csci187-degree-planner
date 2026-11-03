import { Course } from './Course';
import { DegreePlan } from './DegreePlan';
import type { PlanCourse } from './DegreePlan';
import { DegreeRequirement } from './DegreeRequirement';

// Routes and JSON shapes are in API.md. There are no accounts, so there's only plan 1.
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

// 404 means the plan was never saved.
// `offered` is the course list from fetchCourses.
export async function fetchPlan(
  offered: readonly Course[],
  planId: number = PLAN_ID,
  fetchFn: Fetch = fetch,
): Promise<LoadedPlan> {
  const response = await fetchFn(`/api/plans/${planId}`);
  if (response.status === 404) return { plan: DegreePlan.empty(offered), lastSaved: null };
  const saved = await readJson<PlanJson>(response);
  return { plan: DegreePlan.fromRows(saved.courses, offered), lastSaved: saved.lastSaved };
}

// Replaces everything saved for the plan.
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
    throw new Error((await errorMessage(response)) ?? `The server returned ${response.status}`);
  }
  return (await response.json()) as T;
}

// The backend sends { "error": "..." } with a readable message.
async function errorMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : undefined;
  } catch {
    return undefined;
  }
}
