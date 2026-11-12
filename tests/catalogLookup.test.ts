// Keaan Mirchandani
// Tests the Catalog: finding and searching courses, and the course detail lookups.
import { describe, expect, it } from 'vitest';
import { Catalog } from '../src/Catalog';
import { catalog, requirements } from './catalog';

const lookup = new Catalog(catalog, requirements);

const codes = (courses: { code: string }[]) => courses.map((c) => c.code);

describe('Catalog.find', () => {
  it('finds an offered course by its code', () => {
    expect(lookup.find('CSCI 61')?.title).toBe('Data Structures');
  });

  it('returns undefined for a course that is not offered', () => {
    expect(lookup.find('CSCI 999')).toBeUndefined();
  });
});

describe('Catalog.search', () => {
  it('returns every course for an empty search', () => {
    expect(lookup.search('  ')).toHaveLength(catalog.length);
  });

  it('matches part of a code, ignoring case', () => {
    expect(codes(lookup.search('csci 6'))).toEqual(['CSCI 60', 'CSCI 61', 'CSCI 62']);
  });

  it('does not match a longer code that only shares the same digits in order', () => {
    expect(codes(lookup.search('CSCI 10'))).toEqual(['CSCI 10']);
  });

  it('matches words in the title', () => {
    expect(codes(lookup.search('data structures'))).toEqual(['CSCI 61', 'CSEN 12', 'CSEN 79']);
  });

  it('matches words in the description', () => {
    expect(codes(lookup.search('hash tables'))).toContain('CSCI 61');
  });

  it('returns nothing when no course matches', () => {
    expect(lookup.search('underwater basket weaving')).toEqual([]);
  });
});

describe('Catalog.requirementsSatisfiedBy', () => {
  it('lists the requirements that include the course', () => {
    const found = lookup.requirementsSatisfiedBy('CSCI 61').map((r) => r.description);
    expect(found).toEqual(['Lower-division computer science']);
  });

  it('counts a "choose N" requirement', () => {
    const found = lookup.requirementsSatisfiedBy('CSCI 180').map((r) => r.description);
    expect(found).toEqual(['Software emphasis: electives (two courses)']);
  });

  it('returns nothing for a course no requirement lists', () => {
    expect(lookup.requirementsSatisfiedBy('CSCI 999')).toEqual([]);
  });
});

describe('Catalog.coursesRequiring', () => {
  it('lists the courses that need the course as a prerequisite', () => {
    expect(codes(lookup.coursesRequiring('CSCI 10'))).toEqual(['CSCI 60', 'CSCI 127', 'CSCI 146', 'CSCI 165', 'CSCI 166', 'CSEN 11']);
  });

  it('includes courses where it is one option in an either/or group', () => {
    const course = catalog.find((c) => c.prerequisites.some((g) => g.length > 1))!;
    const option = course.prerequisites.find((g) => g.length > 1)![1];
    expect(codes(lookup.coursesRequiring(option))).toContain(course.code);
  });

  it('returns nothing for a course that is no prerequisite', () => {
    expect(lookup.coursesRequiring('CSCI 187')).toEqual([]);
  });
});
