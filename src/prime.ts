// Example module used to verify CI (M1 Part 3). Delete once everyone's tests are in.
export function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false;
  }
  return true;
}
