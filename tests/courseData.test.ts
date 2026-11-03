// Keaan Mirchandani
// Tests that the preloaded course and requirement data is consistent.
import { describe, expect, it } from 'vitest';
import { catalog, requirements } from '../src/catalog';

const codes = new Set(catalog.map((c) => c.code));

describe('course data', () => {
  it('has no course listed twice', () => {
    expect(codes.size).toBe(catalog.length);
  });

  it('only names prerequisites that are courses in the list', () => {
    const unknown = catalog.flatMap((c) => c.prerequisites.flat().filter((p) => !codes.has(p)).map((p) => `${c.code} -> ${p}`));
    expect(unknown).toEqual([]);
  });

  it('has no empty prerequisite group', () => {
    expect(catalog.filter((c) => c.prerequisites.some((group) => group.length === 0))).toEqual([]);
  });

  it('does not list a course as its own prerequisite', () => {
    expect(catalog.filter((c) => c.prerequisites.flat().includes(c.code))).toEqual([]);
  });

  it('only lists courses in the list in each requirement', () => {
    const unknown = requirements.flatMap((r) => r.courses.filter((c) => !codes.has(c)).map((c) => `${r.description} -> ${c}`));
    expect(unknown).toEqual([]);
  });

  it('needs no more courses than each requirement lists', () => {
    expect(requirements.filter((r) => r.count < 1 || r.count > r.courses.length)).toEqual([]);
  });
});
