// Keaan Mirchandani
// A fake backend for the app tests, so they run without the C++ server.
import { vi } from 'vitest';
import courseData from '../src/data/courses.json';
import programData from '../src/data/programs.json';
import requirementData from '../src/data/requirements.json';

export interface SavedPlan {
  lastSaved: string;
  courses: { code: string; quarter: number; status: string }[];
}

// The one account that exists, and its password.
export const ACCOUNT = { email: 'ana@scu.edu', startYear: 2025 };
export const PASSWORD = 'correct horse';

export interface FakePlan {
  planId: number;
  name: string;
  programId: number | null;
  lastSaved: string | null;
  courses: SavedPlan['courses'];
}

const SAVED_AT = '2026-11-02T20:00:00.000Z';
const CREATED_AT = '2026-11-12T18:00:00.000Z';

// A fake backend. `saved` is the plan it starts with, `saveError` makes PUT fail, and
// `saveDelayMs` makes each PUT take that long. It starts logged in as ACCOUNT unless
// `loggedIn` is false.
//
// ACCOUNT starts with one plan, "Main plan" (plan 1), holding `saved` (empty and never
// saved without it). `extraPlans` adds more plans after it. Any other student starts with
// no plans, like an account from before sign-up made one.
//
// It returns the PUT bodies, with extras: `mostAtOnce` is the most PUTs in flight at the
// same time, `posts` records each POST as { url, body }, `requests` records every request
// as "METHOD url", `plans()` is the logged-in student's plans now, and `endSession()` ends
// the session on the server, as if it expired. Setting `meStillLoggedIn` makes /api/me keep
// answering as ACCOUNT after that, as when a session ends between two requests.
export function fakeBackend({ saved, saveError, saveDelayMs = 0, loggedIn = true, extraPlans = [] }: {
  saved?: SavedPlan;
  saveError?: string;
  saveDelayMs?: number;
  loggedIn?: boolean;
  extraPlans?: { name: string; courses?: SavedPlan['courses'] }[];
} = {}) {
  let me: typeof ACCOUNT | null = loggedIn ? ACCOUNT : null;
  let inFlight = 0;
  let nextPlanId = 1;
  const newPlan = (name: string, courses: SavedPlan['courses'] = [], lastSaved: string | null = CREATED_AT): FakePlan => ({
    planId: nextPlanId++,
    name,
    programId: null,
    lastSaved,
    courses,
  });
  const plansByEmail = new Map<string, FakePlan[]>([
    [
      ACCOUNT.email,
      [
        newPlan('Main plan', saved?.courses, saved?.lastSaved ?? null),
        ...extraPlans.map((p) => newPlan(p.name, p.courses, SAVED_AT)),
      ],
    ],
  ]);
  const myPlans = () => {
    if (!me) return [];
    if (!plansByEmail.has(me.email)) plansByEmail.set(me.email, []);
    return plansByEmail.get(me.email) as FakePlan[];
  };
  const info = ({ courses: _courses, ...p }: FakePlan) => ({ ...p, shared: false });
  const puts = Object.assign([] as unknown[], {
    mostAtOnce: 0,
    posts: [] as { url: string; body: unknown }[],
    requests: [] as string[],
    plans: () => myPlans(),
    endSession: () => {
      me = null;
    },
    meStillLoggedIn: false,
  });
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const loggedOut = () => json(401, { error: 'You need to log in' });

  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (init?.method === 'POST') puts.posts.push({ url, body });
    puts.requests.push(`${init?.method ?? 'GET'} ${url}`);

    if (url === '/api/courses') return json(200, courseData);
    if (url === '/api/requirements') {
      return json(
        200,
        requirementData.map(({ program, ...r }, i) => ({
          requirementId: i + 1,
          count: r.courses.length,
          units: null,
          programId: programData.findIndex((p) => p.name === program) + 1,
          ...r,
        })),
      );
    }
    if (url === '/api/me') {
      if (puts.meStillLoggedIn) return json(200, ACCOUNT);
      return me ? json(200, me) : loggedOut();
    }
    if (url === '/api/login') {
      if (body.email !== ACCOUNT.email || body.password !== PASSWORD) return json(401, { error: 'Wrong email or password' });
      me = ACCOUNT;
      return json(200, me);
    }
    if (url === '/api/signup') {
      if (body.email === ACCOUNT.email) return json(409, { error: 'An account with that email already exists' });
      if (body.password.length < 8) return json(400, { error: 'Password must be at least 8 characters' });
      me = { email: body.email, startYear: body.startYear };
      return json(201, me);
    }
    if (url === '/api/logout') {
      me = null;
      return new Response(null, { status: 204 });
    }
    if (!url.startsWith('/api/me/plans')) return json(404, { error: 'Not found' });
    if (!me) return loggedOut();
    const plans = myPlans();
    const badName = (name: unknown) =>
      typeof name !== 'string' || !name.trim() || [...name.trim()].length > 60 ? 'Plan names are 1 to 60 characters' : null;

    if (url === '/api/me/plans') {
      if (init?.method !== 'POST') return json(200, plans.map(info));
      const problem = badName(body.name);
      if (problem) return json(400, { error: problem });
      const from = body.copyFrom === undefined ? undefined : plans.find((p) => p.planId === body.copyFrom);
      if (body.copyFrom !== undefined && !from) return json(404, { error: 'Plan not found' });
      const created = newPlan(body.name.trim(), from ? [...from.courses] : []);
      plans.push(created);
      return json(201, info(created));
    }

    const plan = plans.find((p) => url === `/api/me/plans/${p.planId}`);
    if (!plan) return json(404, { error: 'Plan not found' });
    if (init?.method === 'PATCH') {
      if (body.name !== undefined) {
        const problem = badName(body.name);
        if (problem) return json(400, { error: problem });
        plan.name = body.name.trim();
      }
      return json(200, info(plan));
    }
    if (init?.method === 'DELETE') {
      if (plans.length === 1) return json(400, { error: 'You need at least one plan' });
      plans.splice(plans.indexOf(plan), 1);
      return new Response(null, { status: 204 });
    }
    if (init?.method === 'PUT') {
      puts.push(body);
      puts.mostAtOnce = Math.max(puts.mostAtOnce, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
      inFlight--;
      if (saveError) return json(400, { error: saveError });
      plan.courses = body.courses;
      plan.lastSaved = SAVED_AT;
      return json(200, { planId: plan.planId, lastSaved: SAVED_AT });
    }
    return json(200, { planId: plan.planId, lastSaved: plan.lastSaved, courses: plan.courses });
  });
  return puts;
}
