import { Course } from './Course';
import { DegreePlan } from './DegreePlan';
import type { PlanCourse } from './DegreePlan';
import { DegreeRequirement } from './DegreeRequirement';

// Routes and JSON shapes are in API.md. The session cookie is sent automatically, so the
// plan routes always mean the logged-in student's plan.

type Fetch = typeof fetch;

// An error response, with its status so callers can tell a 401 (logged out) apart.
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface Student {
  email: string;
  startYear: number;
}

export interface SignUp {
  email: string;
  password: string;
  startYear: number;
}

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
  programId: number;
  units: number | null;
  courses: string[];
}

// Until a plan can choose its emphasis, the planner checks the major's requirements and the
// Software emphasis's (program ids 1 and 2 in programs.json). The other emphases and the
// University Core are in the API but not checked yet.
export const CHECKED_PROGRAM_IDS = [1, 2];

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
  return requirements
    .filter((r) => CHECKED_PROGRAM_IDS.includes(r.programId))
    .map((r) => new DegreeRequirement(r.description, r.courses, r.count));
}

// The logged-in student, or null when nobody is logged in.
export async function fetchMe(fetchFn: Fetch = fetch): Promise<Student | null> {
  const response = await fetchFn('/api/me');
  if (response.status === 401) return null;
  return readJson<Student>(response);
}

export async function signUp(details: SignUp, fetchFn: Fetch = fetch): Promise<Student> {
  return readJson<Student>(await postJson(fetchFn, '/api/signup', details));
}

export async function logIn(email: string, password: string, fetchFn: Fetch = fetch): Promise<Student> {
  return readJson<Student>(await postJson(fetchFn, '/api/login', { email, password }));
}

export async function logOut(fetchFn: Fetch = fetch): Promise<void> {
  const response = await fetchFn('/api/logout', { method: 'POST' });
  if (!response.ok) await readJson(response);
}

// The logged-in student's plan. 404 means they have never saved one.
// `offered` is the course list from fetchCourses.
export async function fetchPlan(offered: readonly Course[], fetchFn: Fetch = fetch): Promise<LoadedPlan> {
  const response = await fetchFn('/api/me/plan');
  if (response.status === 404) return { plan: DegreePlan.empty(offered), lastSaved: null };
  const saved = await readJson<PlanJson>(response);
  return { plan: DegreePlan.fromRows(saved.courses, offered), lastSaved: saved.lastSaved };
}

// Replaces everything saved in the logged-in student's plan.
export async function savePlan(plan: DegreePlan, fetchFn: Fetch = fetch): Promise<string> {
  const response = await fetchFn('/api/me/plan', {
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

function postJson(fetchFn: Fetch, url: string, body: unknown): Promise<Response> {
  return fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new ApiError((await errorMessage(response)) ?? fallbackMessage(response.status), response.status);
  }
  return (await response.json()) as T;
}

// A 5xx with no message usually means the dev proxy couldn't reach the backend.
function fallbackMessage(status: number): string {
  return status >= 500 ? `The server can't be reached (${status})` : `The server returned ${status}`;
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
