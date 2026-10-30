// Keaan Mirchandani
// Tests completed courses: marking them, units, and requirement status.
import { describe, expect, it } from 'vitest';
import { DegreePlan, UNITS_TO_GRADUATE } from '../src/DegreePlan';
import { DegreeRequirement } from '../src/DegreeRequirement';

const intro = new DegreeRequirement('Intro', ['CSCI 10', 'CSCI 60']);

describe('DegreePlan completed courses', () => {
  it('starts with no completed courses', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10');
    expect(plan.isCompleted('CSCI 10')).toBe(false);
    expect(plan.completedCodes()).toEqual([]);
    expect(plan.completedUnits()).toBe(0);
  });

  it('marks a course in the plan as completed without changing the original plan', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10');
    const marked = plan.markCompleted('CSCI 10');
    expect(marked.isCompleted('CSCI 10')).toBe(true);
    expect(plan.isCompleted('CSCI 10')).toBe(false);
  });

  it('refuses to mark a course that is not in the plan', () => {
    expect(() => new DegreePlan().markCompleted('CSCI 10')).toThrow('CSCI 10 is not in the plan');
  });

  it('marks a completed course as planned again', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').markCompleted('CSCI 10').markPlanned('CSCI 10');
    expect(plan.isCompleted('CSCI 10')).toBe(false);
  });

  it('keeps completed courses when other courses are added', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').markCompleted('CSCI 10').addCourse(1, 'CSCI 60');
    expect(plan.isCompleted('CSCI 10')).toBe(true);
    expect(plan.isCompleted('CSCI 60')).toBe(false);
  });

  it('forgets that a removed course was completed, even if it is added back', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').markCompleted('CSCI 10').removeCourse(0, 'CSCI 10');
    expect(plan.isCompleted('CSCI 10')).toBe(false);
    expect(plan.addCourse(0, 'CSCI 10').isCompleted('CSCI 10')).toBe(false);
  });

  it('counts only completed courses toward completed units', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').addCourse(0, 'MATH 11').markCompleted('CSCI 10');
    expect(plan.totalUnits()).toBe(9);
    expect(plan.completedUnits()).toBe(5);
    expect(plan.remainingUnits()).toBe(UNITS_TO_GRADUATE - 5);
  });

  it('has all units remaining when nothing is completed', () => {
    expect(new DegreePlan().remainingUnits()).toBe(UNITS_TO_GRADUATE);
  });

  it('counts only completed courses in completed requirement status', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').addCourse(1, 'CSCI 60').markCompleted('CSCI 10');
    expect(plan.requirementStatus([intro])[0].satisfied).toBe(true);
    const [completed] = plan.completedRequirementStatus([intro]);
    expect(completed.satisfied).toBe(false);
    expect(completed.missing).toEqual(['CSCI 60']);
  });

  it('satisfies a requirement once all of its courses are completed', () => {
    const plan = new DegreePlan()
      .addCourse(0, 'CSCI 10')
      .addCourse(1, 'CSCI 60')
      .markCompleted('CSCI 10')
      .markCompleted('CSCI 60');
    expect(plan.completedRequirementStatus([intro])[0].satisfied).toBe(true);
  });
});

describe('DegreePlan rows for the API', () => {
  it('turns the plan into one row per course with its quarter and status', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').addCourse(4, 'CSCI 60').markCompleted('CSCI 10');
    expect(plan.toRows()).toEqual([
      { code: 'CSCI 10', quarter: 0, status: 'completed' },
      { code: 'CSCI 60', quarter: 4, status: 'planned' },
    ]);
  });

  it('gives back the same plan from its rows', () => {
    const plan = new DegreePlan().addCourse(0, 'CSCI 10').addCourse(4, 'CSCI 60').markCompleted('CSCI 10');
    const rebuilt = DegreePlan.fromRows(plan.toRows());
    expect(rebuilt.toRows()).toEqual(plan.toRows());
  });

  it('skips rows that are not offered courses or are in an invalid quarter', () => {
    const plan = DegreePlan.fromRows([
      { code: 'CSCI 999', quarter: 0, status: 'completed' },
      { code: 'CSCI 10', quarter: 12, status: 'planned' },
      { code: 'MATH 11', quarter: 1, status: 'completed' },
    ]);
    expect(plan.toRows()).toEqual([{ code: 'MATH 11', quarter: 1, status: 'completed' }]);
  });
});
