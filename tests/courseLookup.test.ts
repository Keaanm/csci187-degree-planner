// Keaan Mirchandani
// Tests course search and the course detail lookups.
import { describe, expect, it } from 'vitest';
import { catalog, requirements } from '../src/catalog';
import { coursesRequiring, requirementsSatisfiedBy, searchCourses } from '../src/courseLookup';

const codes = (courses: { code: string }[]) => courses.map((c) => c.code);

describe('searchCourses', () => {
  it('returns every course for an empty search', () => {
    expect(searchCourses(catalog, '  ')).toHaveLength(catalog.length);
  });

  it('matches part of a code, ignoring case', () => {
    expect(codes(searchCourses(catalog, 'csci 6'))).toEqual(['CSCI 60', 'CSCI 61', 'CSCI 62']);
  });

  it('does not match a longer code that only shares the same digits in order', () => {
    expect(codes(searchCourses(catalog, 'CSCI 10'))).toEqual(['CSCI 10']);
  });

  it('matches words in the title', () => {
    expect(codes(searchCourses(catalog, 'data structures'))).toEqual(['CSCI 61']);
  });

  it('matches words in the description', () => {
    expect(codes(searchCourses(catalog, 'hash tables'))).toContain('CSCI 61');
  });

  it('returns nothing when no course matches', () => {
    expect(searchCourses(catalog, 'underwater basket weaving')).toEqual([]);
  });
});

describe('requirementsSatisfiedBy', () => {
  it('lists the requirements that include the course', () => {
    const found = requirementsSatisfiedBy(requirements, 'CSCI 61').map((r) => r.description);
    expect(found).toEqual(['Lower-division computer science']);
  });

  it('counts a "choose N" requirement', () => {
    const found = requirementsSatisfiedBy(requirements, 'CSCI 180').map((r) => r.description);
    expect(found).toEqual(['Software emphasis: electives (two courses)']);
  });

  it('returns nothing for a course no requirement lists', () => {
    expect(requirementsSatisfiedBy(requirements, 'CSCI 999')).toEqual([]);
  });
});

describe('coursesRequiring', () => {
  it('lists the courses that need the course as a prerequisite', () => {
    expect(codes(coursesRequiring(catalog, 'CSCI 10'))).toEqual(['CSCI 60']);
  });

  it('includes courses where it is one option in an either/or group', () => {
    const course = catalog.find((c) => c.prerequisites.some((g) => g.length > 1))!;
    const option = course.prerequisites.find((g) => g.length > 1)![1];
    expect(codes(coursesRequiring(catalog, option))).toContain(course.code);
  });

  it('returns nothing for a course that is no prerequisite', () => {
    expect(coursesRequiring(catalog, 'CSCI 187')).toEqual([]);
  });
});
