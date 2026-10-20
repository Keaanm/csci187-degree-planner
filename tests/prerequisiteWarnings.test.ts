// Keaan Mirchandani
// Tests that the 4-year plan warns when a course is placed before its prerequisites.
import { describe, expect, it } from 'vitest';
import { DegreePlan } from '../src/DegreePlan';

describe('DegreePlan.prerequisiteWarnings', () => {
  it('returns no warnings for an empty plan', () => {
    expect(new DegreePlan().prerequisiteWarnings()).toEqual([]);
  });

  it('returns no warnings for a course with no prerequisites', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10');
    expect(plan.prerequisiteWarnings()).toEqual([]);
  });

  it('returns no warnings when the prerequisite is in an earlier quarter', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').addCourse(1, 'CSCI 60');
    expect(plan.prerequisiteWarnings()).toEqual([]);
  });

  it('warns when the prerequisite is missing from the plan', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 60');
    const warnings = plan.prerequisiteWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].course.code).toBe('CSCI 60');
    expect(warnings[0].quarter).toBe(0);
    expect(warnings[0].missing).toEqual([['CSCI 10']]);
  });

  it('warns when the prerequisite is in a later quarter', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 60').addCourse(1, 'CSCI 10');
    expect(plan.prerequisiteWarnings().map((w) => w.course.code)).toEqual(['CSCI 60']);
  });

  it('warns when the prerequisite is in the same quarter', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').addCourse(0, 'CSCI 60');
    expect(plan.prerequisiteWarnings().map((w) => w.course.code)).toEqual(['CSCI 60']);
  });

  it('accepts either course in an either/or prerequisite', () => {
    // CSCI 163 needs MATH 51, and CSCI 61 or CSEN 79.
    const plan = new DegreePlan()
      .addCourse(0, 'CSCI 10')
      .addCourse(0, 'MATH 51')
      .addCourse(1, 'CSCI 60')
      .addCourse(2, 'CSCI 61')
      .addCourse(3, 'CSCI 163');
    expect(plan.prerequisiteWarnings()).toEqual([]);
  });

  it('lists only the prerequisite groups that are still missing', () => {
    // CSCI 163 with MATH 51 planned earlier, but neither CSCI 61 nor CSEN 79.
    const plan = new DegreePlan().addCourse(0, 'MATH 51').addCourse(1, 'CSCI 163');
    const warnings = plan.prerequisiteWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].missing).toEqual([['CSCI 61', 'CSEN 79']]);
  });

  it('stops warning once the missing prerequisite is removed from a later quarter and re-added earlier', () => {
    const before = new DegreePlan().addCourse(1, 'CSCI 60').addCourse(2, 'CSCI 10');
    expect(before.prerequisiteWarnings()).toHaveLength(1);
    const after = before.removeCourse(2, 'CSCI 10').addCourse(0, 'CSCI 10');
    expect(after.prerequisiteWarnings()).toEqual([]);
  });
});
