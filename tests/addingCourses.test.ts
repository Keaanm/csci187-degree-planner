// Darren Hu
// Tests adding and removing courses in the 4-year plan (DegreePlan.addCourse / removeCourse).
import { describe, expect, it } from 'vitest';
import { DegreePlan, MAX_UNITS_PER_QUARTER } from '../src/DegreePlan';

describe('DegreePlan.addCourse and removeCourse', () => {
  it('adds a course to the given quarter', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10');
    expect(plan.coursesIn(0).map((c) => c.code)).toEqual(['CSCI 10']);
    expect(plan.hasCourse('CSCI 10')).toBe(true);
    expect(plan.coursesIn(1)).toEqual([]);
  });

  it('returns a new plan and leaves the original unchanged', () => {
    const original = new DegreePlan();
    const updated = original.addCourse(0, 'CSCI 10');
    expect(updated).not.toBe(original);
    expect(original.hasCourse('CSCI 10')).toBe(false);
    expect(original.coursesIn(0)).toEqual([]);
  });

  it('throws for a course that is not offered', () => {
    expect(() => new DegreePlan().addCourse(0, 'CSCI 999')).toThrow('is not an offered course');
  });

  it('throws when the course is already in the plan, even in another quarter', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10');
    expect(() => plan.addCourse(0, 'CSCI 10')).toThrow('is already in the plan');
    expect(() => plan.addCourse(5, 'CSCI 10')).toThrow('is already in the plan');
  });

  it('allows exactly 18 units in a quarter', () => {
    // CSCI 10 (5) + CSCI 60 (5) + MATH 11 (4) + MATH 12 (4) = 18 units.
    const plan = new DegreePlan()
      .addCourse(0, 'CSCI 10')
      .addCourse(0, 'CSCI 60')
      .addCourse(0, 'MATH 11')
      .addCourse(0, 'MATH 12');
    expect(plan.unitsIn(0)).toBe(MAX_UNITS_PER_QUARTER);
  });

  it('throws when a course would put the quarter over 18 units', () => {
    // CSCI 10 (5) + CSCI 60 (5) + CSCI 161 (5) = 15 units; adding MATH 11 (4) would make 19.
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').addCourse(0, 'CSCI 60').addCourse(0, 'CSCI 161');
    expect(() => plan.addCourse(0, 'MATH 11')).toThrow("can't have more than 18 units");
    expect(plan.addCourse(1, 'MATH 11').hasCourse('MATH 11')).toBe(true);
  });

  it('throws a RangeError for quarters outside 0 to 11 or not whole numbers', () => {
    const plan = new DegreePlan();
    expect(() => plan.addCourse(-1, 'CSCI 10')).toThrow(RangeError);
    expect(() => plan.addCourse(12, 'CSCI 10')).toThrow(RangeError);
    expect(() => plan.addCourse(1.5, 'CSCI 10')).toThrow(RangeError);
    expect(() => plan.removeCourse(12, 'CSCI 10')).toThrow(RangeError);
  });

  it('accepts the first and last quarters', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').addCourse(11, 'CSCI 187');
    expect(plan.coursesIn(0).map((c) => c.code)).toEqual(['CSCI 10']);
    expect(plan.coursesIn(11).map((c) => c.code)).toEqual(['CSCI 187']);
  });

  it('removes a course and leaves the original plan unchanged', () => {
    const plan = new DegreePlan().addCourse(2, 'MATH 11').addCourse(2, 'CSCI 10');
    const removed = plan.removeCourse(2, 'MATH 11');
    expect(removed.hasCourse('MATH 11')).toBe(false);
    expect(removed.coursesIn(2).map((c) => c.code)).toEqual(['CSCI 10']);
    expect(plan.hasCourse('MATH 11')).toBe(true);
  });

  it('does not throw when removing a course that is not there', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10');
    expect(() => plan.removeCourse(0, 'MATH 11')).not.toThrow();
    expect(() => plan.removeCourse(3, 'CSCI 10')).not.toThrow();
    expect(plan.removeCourse(0, 'MATH 11').coursesIn(0).map((c) => c.code)).toEqual(['CSCI 10']);
  });
});
