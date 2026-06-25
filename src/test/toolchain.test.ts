import { test, fc } from '@fast-check/vitest';
import { expect } from 'vitest';

// Smoke test confirming the fast-check + Vitest toolchain is wired up.
test.prop([fc.integer(), fc.integer()])('integer addition is commutative', (a, b) => {
  expect(a + b).toBe(b + a);
});
