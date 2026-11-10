// Keaan Mirchandani
// Tests completed courses: marking them, units, requirement status, and requirement progress.
import { describe, expect, it } from 'vitest';
import { DegreePlan } from '../src/DegreePlan';
import { DegreeRequirement } from '../src/DegreeRequirement';
import { catalog } from './catalog';

const intro = new DegreeRequirement('Intro', ['CSCI 10', 'CSCI 60']);

describe('DegreePlan completed courses', () => {
  it('starts with no completed courses', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10');
    expect(plan.isCompleted('CSCI 10')).toBe(false);
    expect(plan.completedCodes()).toEqual([]);
    expect(plan.completedUnits()).toBe(0);
  });

  it('marks a course in the plan as completed without changing the original plan', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10');
    const marked = plan.markCompleted('CSCI 10');
    expect(marked.isCompleted('CSCI 10')).toBe(true);
    expect(plan.isCompleted('CSCI 10')).toBe(false);
  });

  it('refuses to mark a course that is not in the plan', () => {
    expect(() => DegreePlan.empty(catalog).markCompleted('CSCI 10')).toThrow('CSCI 10 is not in the plan');
  });

  it('marks a completed course as planned again', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10').markCompleted('CSCI 10').markPlanned('CSCI 10');
    expect(plan.isCompleted('CSCI 10')).toBe(false);
  });

  it('keeps completed courses when other courses are added', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10').markCompleted('CSCI 10').addCourse(1, 'CSCI 60');
    expect(plan.isCompleted('CSCI 10')).toBe(true);
    expect(plan.isCompleted('CSCI 60')).toBe(false);
  });

  it('forgets that a removed course was completed, even if it is added back', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10').markCompleted('CSCI 10').removeCourse(0, 'CSCI 10');
    expect(plan.isCompleted('CSCI 10')).toBe(false);
    expect(plan.addCourse(0, 'CSCI 10').isCompleted('CSCI 10')).toBe(false);
  });

  it('counts only completed courses toward completed units', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10').addCourse(0, 'MATH 11').markCompleted('CSCI 10');
    expect(plan.totalUnits()).toBe(9);
    expect(plan.completedUnits()).toBe(5);
  });

  it('counts only completed courses in completed requirement status', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10').addCourse(1, 'CSCI 60').markCompleted('CSCI 10');
    expect(plan.requirementStatus([intro])[0].satisfied).toBe(true);
    const [completed] = plan.completedRequirementStatus([intro]);
    expect(completed.satisfied).toBe(false);
    expect(completed.missing).toEqual(['CSCI 60']);
  });

  it('satisfies a requirement once all of its courses are completed', () => {
    const plan = DegreePlan.empty(catalog)
      .addCourse(0, 'CSCI 10')
      .addCourse(1, 'CSCI 60')
      .markCompleted('CSCI 10')
      .markCompleted('CSCI 60');
    expect(plan.completedRequirementStatus([intro])[0].satisfied).toBe(true);
  });
});

describe('DegreePlan.requirementProgress', () => {
  const stateOf = (plan: DegreePlan) => plan.requirementProgress([intro])[0];

  it('is missing when the plan does not cover the requirement', () => {
    const progress = stateOf(DegreePlan.empty(catalog).addCourse(0, 'CSCI 10').markCompleted('CSCI 10'));
    expect(progress.state).toBe('missing');
    expect(progress.missing).toEqual(['CSCI 60']);
    expect(progress.stillNeeded).toBe(1);
  });

  it('is planned when the plan covers it but not every course is completed', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10').addCourse(1, 'CSCI 60').markCompleted('CSCI 10');
    expect(stateOf(plan).state).toBe('planned');
  });

  it('is completed when the completed courses meet it', () => {
    const plan = DegreePlan.empty(catalog)
      .addCourse(0, 'CSCI 10')
      .addCourse(1, 'CSCI 60')
      .markCompleted('CSCI 10')
      .markCompleted('CSCI 60');
    expect(stateOf(plan).state).toBe('completed');
  });
});

describe('DegreePlan.requirementUnits', () => {
  // CHEM 11 and PHYS 31 are 5 units, so either one meets the science requirement.
  const science = new DegreeRequirement('Science', ['PHYS 31', 'CHEM 11'], 1);

  it('needs the units of every listed course, or the fewest units for a choose-N requirement', () => {
    // CSCI 60 is 5 units and CSCI 61 is 4.
    const either = new DegreeRequirement('Either', ['CSCI 60', 'CSCI 61'], 1);
    expect(DegreePlan.empty(catalog).requirementUnits([intro, either])).toEqual({
      needed: 14,
      completed: 0,
      planned: 0,
    });
  });

  it('splits the covered units into completed and planned', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10').addCourse(1, 'CSCI 60').markCompleted('CSCI 10');
    expect(plan.requirementUnits([intro])).toEqual({ needed: 10, completed: 5, planned: 5 });
  });

  it('counts only as many courses as a choose-N requirement needs', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CHEM 11').addCourse(1, 'PHYS 31').markCompleted('PHYS 31');
    expect(plan.requirementUnits([science])).toEqual({ needed: 5, completed: 5, planned: 0 });
  });

  it('ignores courses that no requirement lists', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSEN 10').markCompleted('CSEN 10');
    expect(plan.requirementUnits([intro]).completed).toBe(0);
  });
});

describe('DegreePlan rows for the API', () => {
  it('turns the plan into one row per course with its quarter and status', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10').addCourse(4, 'CSCI 60').markCompleted('CSCI 10');
    expect(plan.toRows()).toEqual([
      { code: 'CSCI 10', quarter: 0, status: 'completed' },
      { code: 'CSCI 60', quarter: 4, status: 'planned' },
    ]);
  });

  it('gives back the same plan from its rows', () => {
    const plan = DegreePlan.empty(catalog).addCourse(0, 'CSCI 10').addCourse(4, 'CSCI 60').markCompleted('CSCI 10');
    const rebuilt = DegreePlan.fromRows(plan.toRows(), catalog);
    expect(rebuilt.toRows()).toEqual(plan.toRows());
  });

  it('skips rows that are not offered courses or are in an invalid quarter', () => {
    const plan = DegreePlan.fromRows([
      { code: 'CSCI 999', quarter: 0, status: 'completed' },
      { code: 'CSCI 10', quarter: 12, status: 'planned' },
      { code: 'MATH 11', quarter: 1, status: 'completed' },
    ], catalog);
    expect(plan.toRows()).toEqual([{ code: 'MATH 11', quarter: 1, status: 'completed' }]);
  });
});
