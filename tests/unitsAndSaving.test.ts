// William
// Tests unit totals (DegreePlan.unitsIn / totalUnits) and saving/loading the plan (savePlan / loadPlan).
import { describe, expect, it } from 'vitest';
import { DegreePlan } from '../src/DegreePlan';
import { loadPlan, savePlan } from '../src/planStorage';

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  } as unknown as Storage;
}

function storageContaining(text: string): Storage {
  return { getItem: () => text, setItem: () => {} } as unknown as Storage;
}

describe('DegreePlan units and plan storage', () => {
  it('has 0 units in an empty plan', () => {
    const plan = new DegreePlan();
    expect(plan.unitsIn(0)).toBe(0);
    expect(plan.unitsIn(11)).toBe(0);
    expect(plan.totalUnits()).toBe(0);
  });

  it('adds up the units of the courses in one quarter', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').addCourse(0, 'MATH 11');
    expect(plan.unitsIn(0)).toBe(9);
    expect(plan.unitsIn(1)).toBe(0);
  });

  it('adds up the units across all quarters', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').addCourse(0, 'MATH 11').addCourse(1, 'CSCI 60');
    expect(plan.unitsIn(1)).toBe(5);
    expect(plan.totalUnits()).toBe(14);
  });

  it('lowers the units when a course is removed', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').addCourse(0, 'MATH 11');
    const removed = plan.removeCourse(0, 'CSCI 10');
    expect(removed.unitsIn(0)).toBe(4);
    expect(removed.totalUnits()).toBe(4);
  });

  it('gives back the same plan after saving and loading', () => {
    const storage = fakeStorage();
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').addCourse(0, 'MATH 11').addCourse(4, 'CSCI 60');
    savePlan(plan, storage);
    const loaded = loadPlan(storage);
    expect(loaded.toJSON()).toEqual(plan.toJSON());
    expect(loaded.totalUnits()).toBe(14);
  });

  it('loads an empty plan when nothing has been saved', () => {
    const loaded = loadPlan(fakeStorage());
    expect(loaded.toJSON()).toEqual(new DegreePlan().toJSON());
    expect(loaded.totalUnits()).toBe(0);
  });

  it('loads an empty plan instead of crashing when the saved text is not JSON', () => {
    const loaded = loadPlan(storageContaining('not json'));
    expect(loaded.toJSON()).toEqual(new DegreePlan().toJSON());
  });

  it('skips a saved course that is not offered but keeps the rest', () => {
    const saved = JSON.stringify([['CSCI 10', 'CSCI 999'], ['MATH 11']]);
    const loaded = loadPlan(storageContaining(saved));
    expect(loaded.hasCourse('CSCI 999')).toBe(false);
    expect(loaded.coursesIn(0).map((c) => c.code)).toEqual(['CSCI 10']);
    expect(loaded.coursesIn(1).map((c) => c.code)).toEqual(['MATH 11']);
    expect(loaded.totalUnits()).toBe(9);
  });
});
