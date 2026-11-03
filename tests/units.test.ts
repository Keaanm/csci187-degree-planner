// William
// Tests unit totals (DegreePlan.unitsIn / totalUnits).
import { describe, expect, it } from 'vitest';
import { DegreePlan } from '../src/DegreePlan';
import { catalog } from './catalog';

describe('DegreePlan units', () => {
  it('has 0 units in an empty plan', () => {
    const plan = DegreePlan.empty(catalog);
    expect(plan.unitsIn(0)).toBe(0);
    expect(plan.unitsIn(11)).toBe(0);
    expect(plan.totalUnits()).toBe(0);
  });

  it('adds up the units of the courses in one quarter', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10').addCourse(0, 'MATH 11');
    expect(plan.unitsIn(0)).toBe(9);
    expect(plan.unitsIn(1)).toBe(0);
  });

  it('adds up the units across all quarters', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10').addCourse(0, 'MATH 11').addCourse(1, 'CSCI 60');
    expect(plan.unitsIn(1)).toBe(5);
    expect(plan.totalUnits()).toBe(14);
  });

  it('lowers the units when a course is removed', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10').addCourse(0, 'MATH 11');
    const removed = plan.removeCourse(0, 'CSCI 10');
    expect(removed.unitsIn(0)).toBe(4);
    expect(removed.totalUnits()).toBe(4);
  });
});
