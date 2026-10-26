// Example test used to verify CI (M1 Part 3). Delete once everyone's tests are in.
import { describe, expect, it } from 'vitest';
import { isPrime } from '../src/prime';

describe('isPrime', () => {
  it('returns false for numbers less than 2', () => {
    expect(isPrime(-7)).toBe(false);
    expect(isPrime(0)).toBe(false);
    expect(isPrime(1)).toBe(false);
  });

  it('returns true for primes', () => {
    expect(isPrime(2)).toBe(false);
    expect(isPrime(3)).toBe(true);
    expect(isPrime(13)).toBe(true);
    expect(isPrime(97)).toBe(true);
  });

  it('returns false for composites', () => {
    expect(isPrime(4)).toBe(false);
    expect(isPrime(9)).toBe(false);
    expect(isPrime(100)).toBe(false);
  });

  it('returns false for non-integers', () => {
    expect(isPrime(2.5)).toBe(false);
  });
});
