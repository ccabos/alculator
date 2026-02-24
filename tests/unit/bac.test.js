/**
 * Tests for model/bac.js
 * Covers §6.1 "BAC curve" and "Uncertainty bounds" groups.
 */

import { describe, it, expect } from 'vitest';
import { bacSeries, findSoberTime, uncertaintyBounds } from '../../model/bac.js';
import { UNCERTAINTY_CV, SOBER_THRESHOLD } from '../../model/constants.js';

// Reference profile used throughout
const PROFILE = { sex: 'male', weight_kg: 70, height_cm: 175, age: 30 };

// Helper: one wine glass at t=0 (no food)
const ONE_WINE = [{ time_min: 0, volume_ml: 150, abv_pct: 12, carbonated: false, with_food: false }];

// ─── bacSeries ────────────────────────────────────────────────────────────────

describe('bacSeries', () => {
  it('§6.1: zero drinks → BAC = 0 throughout', () => {
    const series = bacSeries([], [], PROFILE, 0, 120);
    expect(series.length).toBe(121);
    expect(series.every(p => p.bac_pct === 0)).toBe(true);
  });

  it('§6.1: one wine at t=0, checked at t=0 → BAC = 0 (no absorption at t=0)', () => {
    // At t=0: elapsed_now=0 → f_now=0, elapsed_prev=-1 → f_prev=0, delta_f=0
    const series = bacSeries(ONE_WINE, [], PROFILE, 0, 0);
    expect(series[0].bac_pct).toBe(0);
  });

  it('§6.1: one wine at t=0, peak BAC is in (0, 0.10 %)', () => {
    const series = bacSeries(ONE_WINE, [], PROFILE, 0, 180);
    const peak = Math.max(...series.map(p => p.bac_pct));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(0.10);
  });

  it('§6.1: BAC is never negative', () => {
    const series = bacSeries(ONE_WINE, [], PROFILE, 0, 360);
    expect(series.every(p => p.bac_pct >= 0)).toBe(true);
  });

  it('§6.1: sober time is after the drink time', () => {
    const series = bacSeries(ONE_WINE, [], PROFILE, 0, 480);
    const sober = findSoberTime(series);
    expect(sober).not.toBeNull();
    expect(sober).toBeGreaterThan(0);
  });
});

// ─── uncertaintyBounds ────────────────────────────────────────────────────────

describe('uncertaintyBounds', () => {
  it('§6.1: bounds at 0.08 % → lower ≈ 0.0632, upper ≈ 0.0968', () => {
    const { lower, upper } = uncertaintyBounds(0.08);
    expect(lower).toBeCloseTo(0.08 * (1 - UNCERTAINTY_CV), 6);
    expect(upper).toBeCloseTo(0.08 * (1 + UNCERTAINTY_CV), 6);
  });

  it('§6.1: bounds at 0.00 % → both 0', () => {
    const { lower, upper } = uncertaintyBounds(0);
    expect(lower).toBe(0);
    expect(upper).toBe(0);
  });
});
