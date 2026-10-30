// Keaan Mirchandani
// Tests the API client with a fake fetch, so no backend is needed.
import { describe, expect, it } from 'vitest';
import { fetchCourses, fetchPlan, fetchRequirements, savePlan } from '../src/api';
import { DegreePlan } from '../src/DegreePlan';

interface Call {
  url: string;
  init?: RequestInit;
}

function fakeFetch(status: number, body: unknown = null) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
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
      { requirementId: 7, description: 'Electives', count: 2, courses: ['CSCI 168', 'CSCI 180', 'CSCI 183'] },
    ]);
    const [requirement] = await fetchRequirements(fetchFn);
    expect(requirement.description).toBe('Electives');
    expect(requirement.count).toBe(2);
    expect(requirement.isSatisfiedBy(['CSCI 168', 'CSCI 180'])).toBe(true);
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
    const { plan, lastSaved } = await fetchPlan(1, fetchFn);
    expect(calls[0].url).toBe('/api/plans/1');
    expect(plan.coursesIn(1).map((c) => c.code)).toEqual(['CSCI 60']);
    expect(plan.isCompleted('CSCI 10')).toBe(true);
    expect(plan.isCompleted('CSCI 60')).toBe(false);
    expect(lastSaved).toBe('2026-10-30T20:00:00.000Z');
  });

  it('loads an empty plan when the plan has never been saved', async () => {
    const { fetchFn } = fakeFetch(404);
    const { plan, lastSaved } = await fetchPlan(1, fetchFn);
    expect(plan.totalUnits()).toBe(0);
    expect(lastSaved).toBeNull();
  });

  it('saves the whole plan as rows with a PUT and returns the new last-saved time', async () => {
    const { fetchFn, calls } = fakeFetch(200, { planId: 1, lastSaved: '2026-10-30T21:00:00.000Z' });
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').markCompleted('CSCI 10');
    const lastSaved = await savePlan(plan, 1, fetchFn);
    expect(calls[0].url).toBe('/api/plans/1');
    expect(calls[0].init?.method).toBe('PUT');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      courses: [{ code: 'CSCI 10', quarter: 0, status: 'completed' }],
    });
    expect(lastSaved).toBe('2026-10-30T21:00:00.000Z');
  });

  it('throws when the server returns an error', async () => {
    await expect(fetchCourses(fakeFetch(500).fetchFn)).rejects.toThrow('The server returned 500');
    await expect(fetchPlan(1, fakeFetch(500).fetchFn)).rejects.toThrow('The server returned 500');
    await expect(savePlan(new DegreePlan(), 1, fakeFetch(400).fetchFn)).rejects.toThrow('The server returned 400');
  });
});
