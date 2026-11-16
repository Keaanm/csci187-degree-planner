import { Course } from './Course';
import { DegreePlan } from './DegreePlan';
import type { PlanCourse } from './DegreePlan';
import { DegreeRequirement } from './DegreeRequirement';

// Routes and JSON shapes are in API.md. The session cookie is sent automatically, so the
// plan routes always mean the logged-in student's plans.

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

// One of the student's plans, without its courses.
export interface PlanInfo {
  planId: number;
  name: string;
  programId: number | null;
  lastSaved: string | null;
  shared: boolean;
}

export const FIRST_PLAN_NAME = 'Main plan';
export const MAX_PLAN_NAME_LENGTH = 60;

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

// The logged-in student's plans, oldest first. A student with no plans yet (an account
// from before sign-up created one) gets a "Main plan", so there is always one to show.
export async function fetchPlans(fetchFn: Fetch = fetch): Promise<PlanInfo[]> {
  const plans = await getJson<PlanInfo[]>(fetchFn, '/api/me/plans');
  if (plans.length > 0) return plans;
  return [await createPlan({ name: FIRST_PLAN_NAME }, fetchFn)];
}

// With `copyFrom`, the new plan starts with that plan's saved courses.
export async function createPlan(
  details: { name: string; copyFrom?: number },
  fetchFn: Fetch = fetch,
): Promise<PlanInfo> {
  return readJson<PlanInfo>(await postJson(fetchFn, '/api/me/plans', details));
}

export async function renamePlan(planId: number, name: string, fetchFn: Fetch = fetch): Promise<PlanInfo> {
  return readJson<PlanInfo>(await sendJson(fetchFn, 'PATCH', `/api/me/plans/${planId}`, { name }));
}

export async function deletePlan(planId: number, fetchFn: Fetch = fetch): Promise<void> {
  const response = await fetchFn(`/api/me/plans/${planId}`, { method: 'DELETE' });
  if (!response.ok) await readJson(response);
}

// One of the student's plans. `offered` is the course list from fetchCourses.
export async function fetchPlan(planId: number, offered: readonly Course[], fetchFn: Fetch = fetch): Promise<LoadedPlan> {
  const saved = await getJson<PlanJson>(fetchFn, `/api/me/plans/${planId}`);
  return { plan: DegreePlan.fromRows(saved.courses, offered), lastSaved: saved.lastSaved };
}

// Replaces everything saved in one of the student's plans.
export async function savePlan(planId: number, plan: DegreePlan, fetchFn: Fetch = fetch): Promise<string> {
  const response = await sendJson(fetchFn, 'PUT', `/api/me/plans/${planId}`, { courses: plan.toRows() });
  const saved = await readJson<{ planId: number; lastSaved: string }>(response);
  return saved.lastSaved;
}

async function getJson<T>(fetchFn: Fetch, url: string): Promise<T> {
  return readJson<T>(await fetchFn(url));
}

function postJson(fetchFn: Fetch, url: string, body: unknown): Promise<Response> {
  return sendJson(fetchFn, 'POST', url, body);
}

function sendJson(fetchFn: Fetch, method: string, url: string, body: unknown): Promise<Response> {
  return fetchFn(url, {
    method,
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
