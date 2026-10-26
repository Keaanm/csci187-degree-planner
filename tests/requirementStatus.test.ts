// Henry Packer
// Tests degree requirement satisfaction and requirement status in a degree plan.
import { describe, expect, it } from 'vitest';
import { DegreePlan } from '../src/DegreePlan';
import { DegreeRequirement } from '../src/DegreeRequirement';
import { requirements } from '../src/catalog';

describe('DegreeRequirement and DegreePlan.requirementStatus', () => {
    it('does not satisfy a requirement when none of its courses are taken', () => {
        const requirement = new DegreeRequirement('Core courses', ['CSCI 10', 'CSCI 60']);

        expect(requirement.isSatisfiedBy([])).toBe(false);
        expect(requirement.stillNeeded([])).toBe(2);
    });

    it('satisfies a requirement when all required courses are taken', () => {
        const requirement = new DegreeRequirement('Core courses', ['CSCI 10', 'CSCI 60']);

        expect(requirement.isSatisfiedBy(['CSCI 10', 'CSCI 60'])).toBe(true);
        expect(requirement.stillNeeded(['CSCI 10', 'CSCI 60'])).toBe(0);
    });

    it('counts only the courses still needed', () => {
        const requirement = new DegreeRequirement('Core courses', ['CSCI 10', 'CSCI 60', 'CSCI 61']);

        expect(requirement.stillNeeded(['CSCI 10'])).toBe(2);
    });

    it('lists only courses that have not been taken', () => {
        const requirement = new DegreeRequirement('Core courses', ['CSCI 10', 'CSCI 60', 'CSCI 61']);

        expect(requirement.missingCourses(['CSCI 10'])).toEqual(['CSCI 60', 'CSCI 61']);
    });

    it('satisfies a choose-two requirement when any two listed courses are taken', () => {
        const requirement = new DegreeRequirement('Electives', ['CSCI 10', 'CSCI 60', 'CSCI 61'], 2);

        expect(requirement.isSatisfiedBy(['CSCI 10', 'CSCI 61'])).toBe(true);
        expect(requirement.stillNeeded(['CSCI 10', 'CSCI 61'])).toBe(0);
    });

    it('never reports a negative number of courses still needed', () => {
        const requirement = new DegreeRequirement('Choose one', ['CSCI 10', 'CSCI 60', 'CSCI 61'], 1);

        expect(requirement.stillNeeded(['CSCI 10', 'CSCI 60'])).toBe(0);
    });

    it('reports an empty degree plan as satisfying none of the catalog requirements', () => {
        expect(requirements.length).toBeGreaterThan(0);

        const statuses = new DegreePlan().requirementStatus(requirements);

        expect(statuses).toHaveLength(requirements.length);
        expect(statuses.every((status) => !status.satisfied)).toBe(true);
    });

    it('satisfies the natural science requirement when CHEM 11 is planned', () => {
        const plan = new DegreePlan().addCourse(0, 'CHEM 11');
        const statuses = plan.requirementStatus(requirements);
        const naturalScience = statuses.find(
            (status) => status.requirement.description === 'Natural science (one course)',
        );

        expect(naturalScience).toBeDefined();
        expect(naturalScience?.satisfied).toBe(true);
        expect(naturalScience?.stillNeeded).toBe(0);
    });


    it('does not satisfy a requirement when only some of its courses are taken', () => {
        const requirement = new DegreeRequirement('Core courses', ['CSCI 10', 'CSCI 60', 'CSCI 61']);

        expect(requirement.isSatisfiedBy(['CSCI 10'])).toBe(false);
    });

    it('does not satisfy a choose-two requirement with only one listed course taken', () => {
        const requirement = new DegreeRequirement('Electives', ['CSCI 10', 'CSCI 60', 'CSCI 61'], 2);

        expect(requirement.isSatisfiedBy(['CSCI 10'])).toBe(false);
        expect(requirement.stillNeeded(['CSCI 10'])).toBe(1);
    });

    it('ignores courses that are not part of the requirement', () => {
        const requirement = new DegreeRequirement('Core courses', ['CSCI 10', 'CSCI 60']);

        expect(requirement.stillNeeded(['MATH 11', 'CHEM 11'])).toBe(2);
        expect(requirement.isSatisfiedBy(['MATH 11', 'CHEM 11'])).toBe(false);
    });
});