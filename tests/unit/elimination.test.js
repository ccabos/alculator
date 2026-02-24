/**
 * Tests for model/elimination.js
 * Covers §6.1 "M-M kinetics" group.
 */

import { describe, it, expect } from 'vitest';
import { betaEff, eliminationStep } from '../../model/elimination.js';
import { BETA_MAX, KM } from '../../model/constants.js';

describe('betaEff — Michaelis-Menten effective elimination rate', () => {
  it('§6.1: betaEff(0) = 0 (no substrate, ADH is idle)', () => {
    expect(betaEff(0)).toBe(0);
  });

  it('§6.1: betaEff(Km) = BETA_MAX / 2 (half-saturation point)', () => {
    expect(betaEff(KM)).toBeCloseTo(BETA_MAX / 2, 10);
  });

  it('§6.1: betaEff approaches BETA_MAX at very high BAC (ADH saturated)', () => {
    // At 100× Km, M-M rate = BETA_MAX × 100/(101) ≈ 0.9901 × BETA_MAX
    const highBAC = 100 * KM;
    expect(betaEff(highBAC)).toBeGreaterThan(0.99 * BETA_MAX);
    expect(betaEff(highBAC)).toBeLessThanOrEqual(BETA_MAX);
  });
});

describe('eliminationStep — per-minute BAC decrement', () => {
  it('§6.1: eliminationStep(c) = betaEff(c) / 60 for typical BAC', () => {
    const bac = 0.08;
    expect(eliminationStep(bac)).toBeCloseTo(betaEff(bac) / 60, 10);
  });
});
