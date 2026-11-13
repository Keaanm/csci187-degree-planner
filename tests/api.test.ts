// Keaan Mirchandani
// Tests the API client with a fake fetch, so no backend is needed.
import { describe, expect, it } from 'vitest';
import {
  ApiError,
  createPlan,
  deletePlan,
  fetchCourses,
  fetchMe,
  fetchPlan,
  fetchPlans,
  fetchRequirements,
  logIn,
  logOut,
  renamePlan,
  savePlan,
  signUp,
} from '../src/api';
import { Course } from '../src/Course';
import { DegreePlan } from '../src/DegreePlan';
import { catalog } from './catalog';

interface Call {
  url: string;
  init?: RequestInit;
}

function fakeFetch(status: number, body: unknown = null) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    // A 204 can't have a body.
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe('API client', () => {
  it('loads courses with their prerequisite groups', async () => {
    const { fetchFn, calls } = fakeFetch(200, [
      { code: 'CSCI 61', title: 'Data Structures', description: 'Lists and trees.', units: 4, prerequisites: [['CSCI 60']] },
    ]);
    const [course] = await fetchCourses(fetchFn);
    expect(calls[0].url).toBe('/api/courses');
    expect(course.code).toBe('CSCI 61');
    expect(course.units).toBe(4);
    expect(course.prerequisites).toEqual([['CSCI 60']]);
  });

  it('loads requirements with their count', async () => {
    const { fetchFn } = fakeFetch(200, [
      { requirementId: 7, description: 'Electives', count: 2, programId: 2, units: null, courses: ['CSCI 168', 'CSCI 180', 'CSCI 183'] },
    ]);
    const [requirement] = await fetchRequirements(fetchFn);
    expect(requirement.description).toBe('Electives');
    expect(requirement.count).toBe(2);
    expect(requirement.isSatisfiedBy(['CSCI 168', 'CSCI 180'])).toBe(true);
  });

  it('only checks the major and the Software emphasis until a plan can choose its emphasis', async () => {
    const { fetchFn } = fakeFetch(200, [
      { requirementId: 1, description: 'Major', count: 1, programId: 1, units: null, courses: ['CSCI 10'] },
      { requirementId: 8, description: 'Security', count: 1, programId: 5, units: null, courses: ['CSCI 181'] },
      { requirementId: 14, description: 'Core: Ethics', count: 1, programId: 6, units: null, courses: [] },
    ]);
    const requirements = await fetchRequirements(fetchFn);
    expect(requirements.map((r) => r.description)).toEqual(['Major']);
  });

  it('loads a saved plan with its completed courses and last-saved time', async () => {
    const { fetchFn, calls } = fakeFetch(200, {
      planId: 1,
      lastSaved: '2026-10-30T20:00:00.000Z',
      courses: [
        { code: 'CSCI 10', quarter: 0, status: 'completed' },
        { code: 'CSCI 60', quarter: 1, status: 'planned' },
      ],
    });
    const { plan, lastSaved } = await fetchPlan(3, catalog, fetchFn);
    expect(calls[0].url).toBe('/api/me/plans/3');
    expect(plan.coursesIn(1).map((c) => c.code)).toEqual(['CSCI 60']);
    expect(plan.isCompleted('CSCI 10')).toBe(true);
    expect(plan.isCompleted('CSCI 60')).toBe(false);
    expect(lastSaved).toBe('2026-10-30T20:00:00.000Z');
  });

  it('loads an empty plan that has never been saved', async () => {
    const { fetchFn } = fakeFetch(200, { planId: 3, lastSaved: null, courses: [] });
    const { plan, lastSaved } = await fetchPlan(3, catalog, fetchFn);
    expect(plan.totalUnits()).toBe(0);
    expect(lastSaved).toBeNull();
  });

  it('skips saved courses that the server no longer offers', async () => {
    const offered = [new Course('CSCI 10', 'Introduction to Computer Science', '', 5)];
    const { fetchFn } = fakeFetch(200, {
      planId: 1,
      lastSaved: '2026-10-30T20:00:00.000Z',
      courses: [
        { code: 'CSCI 10', quarter: 0, status: 'planned' },
        { code: 'CSCI 60', quarter: 1, status: 'planned' },
      ],
    });
    const { plan } = await fetchPlan(1, offered, fetchFn);
    expect(plan.hasCourse('CSCI 10')).toBe(true);
    expect(plan.hasCourse('CSCI 60')).toBe(false);
  });

  it('only lets the loaded plan add courses the server offers', async () => {
    const offered = [new Course('CSCI 10', 'Introduction to Computer Science', '', 5)];
    const { plan } = await fetchPlan(1, offered, fakeFetch(200, { planId: 1, lastSaved: null, courses: [] }).fetchFn);
    expect(plan.addCourse(0, 'CSCI 10').hasCourse('CSCI 10')).toBe(true);
    expect(() => plan.addCourse(0, 'CSCI 60')).toThrow('CSCI 60 is not an offered course');
  });

  it('saves the whole plan as rows with a PUT and returns the new last-saved time', async () => {
    const { fetchFn, calls } = fakeFetch(200, { planId: 1, lastSaved: '2026-10-30T21:00:00.000Z' });
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10').markCompleted('CSCI 10');
    const lastSaved = await savePlan(3, plan, fetchFn);
    expect(calls[0].url).toBe('/api/me/plans/3');
    expect(calls[0].init?.method).toBe('PUT');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      courses: [{ code: 'CSCI 10', quarter: 0, status: 'completed' }],
    });
    expect(lastSaved).toBe('2026-10-30T21:00:00.000Z');
  });

  it("shows the server's error message when it sends one", async () => {
    const { fetchFn } = fakeFetch(400, { error: 'CSCI 999 is not an offered course' });
    await expect(savePlan(1, DegreePlan.empty(catalog), fetchFn)).rejects.toThrow('CSCI 999 is not an offered course');
  });

  it('throws when the server returns an error', async () => {
    await expect(fetchCourses(fakeFetch(500).fetchFn)).rejects.toThrow("The server can't be reached (500)");
    await expect(fetchPlan(1, catalog, fakeFetch(500).fetchFn)).rejects.toThrow("The server can't be reached (500)");
    await expect(savePlan(1, DegreePlan.empty(catalog), fakeFetch(400).fetchFn)).rejects.toThrow('The server returned 400');
  });

  it('gives errors their status, so a 401 can be told apart', async () => {
    const error = await savePlan(1, DegreePlan.empty(catalog), fakeFetch(401, { error: 'You need to log in' }).fetchFn).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.message).toBe('You need to log in');
  });
});

describe('API client plans', () => {
  const main = { planId: 3, name: 'Main plan', programId: null, lastSaved: null, shared: false };

  it("lists the student's plans", async () => {
    const { fetchFn, calls } = fakeFetch(200, [main]);
    expect(await fetchPlans(fetchFn)).toEqual([main]);
    expect(calls.map((c) => c.url)).toEqual(['/api/me/plans']);
  });

  it('makes a "Main plan" for a student with no plans', async () => {
    const calls: Call[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return init?.method === 'POST' ? new Response(JSON.stringify(main), { status: 201 }) : new Response('[]');
    }) as typeof fetch;
    expect(await fetchPlans(fetchFn)).toEqual([main]);
    expect(calls[1].url).toBe('/api/me/plans');
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ name: 'Main plan' });
  });

  it('makes a plan, optionally as a copy of another', async () => {
    const { fetchFn, calls } = fakeFetch(201, { ...main, planId: 4, name: 'Abroad' });
    expect((await createPlan({ name: 'Abroad', copyFrom: 3 }, fetchFn)).planId).toBe(4);
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ name: 'Abroad', copyFrom: 3 });
  });

  it('renames a plan with a PATCH', async () => {
    const { fetchFn, calls } = fakeFetch(200, { ...main, name: 'Plan A' });
    expect((await renamePlan(3, 'Plan A', fetchFn)).name).toBe('Plan A');
    expect(calls[0].url).toBe('/api/me/plans/3');
    expect(calls[0].init?.method).toBe('PATCH');
    expect(new Headers(calls[0].init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ name: 'Plan A' });
  });

  it("deletes a plan, and shows the server's reason when it can't", async () => {
    const { fetchFn, calls } = fakeFetch(204);
    await deletePlan(3, fetchFn);
    expect(calls[0]).toMatchObject({ url: '/api/me/plans/3', init: { method: 'DELETE' } });
    await expect(deletePlan(3, fakeFetch(400, { error: 'You need at least one plan' }).fetchFn)).rejects.toThrow(
      'You need at least one plan',
    );
  });
});

describe('API client accounts', () => {
  it('loads the logged-in student', async () => {
    const { fetchFn, calls } = fakeFetch(200, { email: 'ana@scu.edu', startYear: 2025 });
    expect(await fetchMe(fetchFn)).toEqual({ email: 'ana@scu.edu', startYear: 2025 });
    expect(calls[0].url).toBe('/api/me');
  });

  it('returns null for /api/me when nobody is logged in', async () => {
    expect(await fetchMe(fakeFetch(401, { error: 'You need to log in' }).fetchFn)).toBeNull();
  });

  it('still throws for other /api/me errors', async () => {
    await expect(fetchMe(fakeFetch(500).fetchFn)).rejects.toThrow("The server can't be reached (500)");
  });

  it('signs up with a JSON POST of the email, password and start year', async () => {
    const { fetchFn, calls } = fakeFetch(201, { email: 'ana@scu.edu', startYear: 2025 });
    const student = await signUp({ email: 'ana@scu.edu', password: 'correct horse', startYear: 2025 }, fetchFn);
    expect(student).toEqual({ email: 'ana@scu.edu', startYear: 2025 });
    expect(calls[0].url).toBe('/api/signup');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ email: 'ana@scu.edu', password: 'correct horse', startYear: 2025 });
  });

  it("shows the server's message when signing up fails", async () => {
    const { fetchFn } = fakeFetch(409, { error: 'An account with that email already exists' });
    await expect(signUp({ email: 'ana@scu.edu', password: 'correct horse', startYear: 2025 }, fetchFn)).rejects.toThrow(
      'An account with that email already exists',
    );
  });

  it('logs in with a JSON POST and rejects a wrong password', async () => {
    const ok = fakeFetch(200, { email: 'ana@scu.edu', startYear: 2025 });
    expect(await logIn('ana@scu.edu', 'correct horse', ok.fetchFn)).toEqual({ email: 'ana@scu.edu', startYear: 2025 });
    expect(ok.calls[0].url).toBe('/api/login');
    expect(JSON.parse(String(ok.calls[0].init?.body))).toEqual({ email: 'ana@scu.edu', password: 'correct horse' });

    const wrong = fakeFetch(401, { error: 'Wrong email or password' });
    await expect(logIn('ana@scu.edu', 'nope', wrong.fetchFn)).rejects.toThrow('Wrong email or password');
  });

  it('logs out with a POST that has no body', async () => {
    const { fetchFn, calls } = fakeFetch(204);
    await logOut(fetchFn);
    expect(calls[0].url).toBe('/api/logout');
    expect(calls[0].init?.method).toBe('POST');
  });
});
