/**
 * Tests for model/absorption.js
 * Covers §6.1 "Ethanol dose", "Absorption model", "Per-drink food flag",
 * and "Food log — parameter application", plus the new §6.1 drinking-duration
 * tests for the closed-form convolution model.
 */

import { describe, it, expect } from 'vitest';
import {
  ethanolG,
  tBase,
  absorptionFraction,
  resolveModifiers,
} from '../../model/absorption.js';
import {
  ETHANOL_DENSITY,
  T_BASE_NORMAL,
  T_BASE_CARBONATED,
  FOOD_PARAMS,
  WITH_FOOD_FLAG,
} from '../../model/constants.js';

// ─── ethanolG ──────────────────────────────────────────────────────────────────

describe('ethanolG', () => {
  it('standard beer: 330 mL × 5 %', () => {
    expect(ethanolG(330, 5)).toBeCloseTo(330 * 0.05 * ETHANOL_DENSITY, 4);
    expect(ethanolG(330, 5)).toBeCloseTo(13.0, 1);     // ≈ 13.01 g
  });

  it('shot: 40 mL × 40 %', () => {
    expect(ethanolG(40, 40)).toBeCloseTo(40 * 0.40 * ETHANOL_DENSITY, 4);
    expect(ethanolG(40, 40)).toBeCloseTo(12.6, 1);     // ≈ 12.62 g
  });

  it('custom: 200 mL × 6.5 %', () => {
    expect(ethanolG(200, 6.5)).toBeCloseTo(200 * 0.065 * ETHANOL_DENSITY, 4);
    expect(ethanolG(200, 6.5)).toBeCloseTo(10.3, 1);   // ≈ 10.26 g
  });
});

// ─── tBase ─────────────────────────────────────────────────────────────────────

describe('tBase', () => {
  it('returns T_BASE_NORMAL for non-carbonated drinks', () => {
    expect(tBase(false)).toBe(T_BASE_NORMAL);           // 45 min
  });

  it('returns T_BASE_CARBONATED for carbonated drinks', () => {
    expect(tBase(true)).toBe(T_BASE_CARBONATED);        // 20 min
  });
});

// ─── absorptionFraction — instantaneous model (duration_min = 0) ───────────────

describe('absorptionFraction (instantaneous)', () => {
  it('§6.1: default drink at t=0, checked at 22.5 min → 0.5 (half absorbed)', () => {
    expect(absorptionFraction(22.5, 45)).toBeCloseTo(0.5, 6);
  });

  it('§6.1: default drink, checked at 45 min → 1.0 (fully absorbed)', () => {
    expect(absorptionFraction(45, 45)).toBeCloseTo(1.0, 6);
  });

  it('§6.1: default drink, checked at 90 min → 1.0 (clamped)', () => {
    expect(absorptionFraction(90, 45)).toBeCloseTo(1.0, 6);
  });

  it('§6.1: carbonated drink, checked at 10 min → 0.5 (T_absorb = 20 min)', () => {
    expect(absorptionFraction(10, T_BASE_CARBONATED)).toBeCloseTo(0.5, 6);
  });

  it('§6.1: food drink, checked at 45 min → 0.5 (T_absorb = 90 min)', () => {
    expect(absorptionFraction(45, 90)).toBeCloseTo(0.5, 6);
  });

  it('returns 0 before the drink is started (negative elapsed)', () => {
    expect(absorptionFraction(-1, 45)).toBe(0);
  });

  it('returns 0 at elapsed = 0 (instantaneous: nothing absorbed yet)', () => {
    expect(absorptionFraction(0, 45)).toBe(0);
  });
});

// ─── absorptionFraction — extended-duration model (duration_min > 0) ───────────

describe('absorptionFraction (extended duration, D=30 min, T_absorb=45 min)', () => {
  const T = 45;
  const D = 30;

  // Phase boundaries:
  //   Quadratic rise:  0 ≤ elapsed < D      (30 min)
  //   Linear middle:   D ≤ elapsed ≤ T      (30–45 min)
  //   Quadratic fall:  T < elapsed < D+T    (45–75 min)
  //   Fully absorbed:  elapsed ≥ D+T        (≥ 75 min)

  it('fraction = 0 at elapsed = 0 (no sips consumed yet)', () => {
    expect(absorptionFraction(0, T, D)).toBeCloseTo(0, 6);
  });

  it('quadratic phase at elapsed = 15 min → 15²/(2×30×45)', () => {
    const expected = (15 ** 2) / (2 * D * T);   // = 225 / 2700 ≈ 0.0833
    expect(absorptionFraction(15, T, D)).toBeCloseTo(expected, 6);
  });

  it('end of drinking phase at elapsed = D=30 min → (30-15)/45 = 1/3', () => {
    // At t=D, quadratic phase ends; this equals (D - D/2)/T = D/(2T)
    const expected = D / (2 * T);               // = 30/90 ≈ 0.3333
    expect(absorptionFraction(D, T, D)).toBeCloseTo(expected, 6);
  });

  it('linear middle phase at elapsed = T=45 min → (45-15)/45 = 2/3', () => {
    // In the linear phase f = (elapsed - D/2) / T (identical to midpoint approximation)
    const expected = (T - D / 2) / T;           // = 30/45 ≈ 0.6667
    expect(absorptionFraction(T, T, D)).toBeCloseTo(expected, 6);
  });

  it('linear middle agrees with midpoint approximation between D and T', () => {
    // For any elapsed in [D, T], f_exact = f_midpoint exactly
    const midpoint_elapsed = 40;
    const f_exact     = absorptionFraction(midpoint_elapsed, T, D);
    const f_midpoint  = absorptionFraction(midpoint_elapsed - D / 2, T, 0);
    expect(f_exact).toBeCloseTo(f_midpoint, 6);
  });

  it('fully absorbed at elapsed = D+T = 75 min → 1.0', () => {
    expect(absorptionFraction(D + T, T, D)).toBeCloseTo(1.0, 6);
  });

  it('still 1.0 after D+T (clamped)', () => {
    expect(absorptionFraction(D + T + 10, T, D)).toBeCloseTo(1.0, 6);
  });

  it('midpoint model finishes D/2 earlier than exact model', () => {
    // Midpoint model says "done" at D/2 + T = 15 + 45 = 60
    // Exact model is NOT yet done at t=60 (still 8 % left to absorb)
    const f_exact_at_60    = absorptionFraction(60, T, D);
    const f_midpoint_at_60 = absorptionFraction(60 - D / 2, T, 0); // = 1.0
    expect(f_midpoint_at_60).toBeCloseTo(1.0, 6);
    expect(f_exact_at_60).toBeLessThan(1.0);
    // Specifically: 1 - D²/(8DT) = 1 - D/(8T) ≈ 1 - 0.0833 ≈ 0.9167
    expect(f_exact_at_60).toBeCloseTo(1 - D / (8 * T), 3);
  });
});

describe('absorptionFraction (extended duration, edge cases)', () => {
  it('duration_min = 0 is identical to the instantaneous formula', () => {
    for (const t of [0, 10, 22.5, 45, 90]) {
      expect(absorptionFraction(t, 45, 0)).toBeCloseTo(absorptionFraction(t, 45), 9);
    }
  });

  it('duration much shorter than T_absorb is nearly identical to instantaneous', () => {
    // D=2 min, T=45 min → D/T = 0.044; peak error < 0.3%
    const elapsed = 22.5;
    const f_short_dur = absorptionFraction(elapsed, 45, 2);
    const f_instant   = absorptionFraction(elapsed - 1, 45, 0);  // offset by D/2=1
    expect(Math.abs(f_short_dur - f_instant)).toBeLessThan(0.005);
  });

  it('duration equal to T_absorb (D = T)', () => {
    // At elapsed = D+T = 2T, should be fully absorbed
    expect(absorptionFraction(2 * 45, 45, 45)).toBeCloseTo(1.0, 6);
    // At elapsed = T, half of dose is absorbed: f = 1 - T/(8T) = 7/8 = 0.875
    // Actually: f = (H(T,T) - H(0,T))/T = (T/2)/T = 0.5  ← end of quadratic phase
    expect(absorptionFraction(45, 45, 45)).toBeCloseTo(0.5, 6);
  });

  it('fraction is monotonically non-decreasing over time', () => {
    const times = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 90];
    let prev = 0;
    for (const t of times) {
      const f = absorptionFraction(t, 45, 30);
      expect(f).toBeGreaterThanOrEqual(prev - 1e-10); // allow tiny float errors
      prev = f;
    }
  });
});

// ─── resolveModifiers ─────────────────────────────────────────────────────────

describe('resolveModifiers — fasted defaults', () => {
  it('no food: non-carbonated → T_BASE_NORMAL, factor 1.00', () => {
    const r = resolveModifiers(0, false, [], false);
    expect(r.T_absorb).toBe(T_BASE_NORMAL);
    expect(r.ethanol_factor).toBe(1.00);
  });

  it('no food: carbonated → T_BASE_CARBONATED, factor 1.00', () => {
    const r = resolveModifiers(0, true, [], false);
    expect(r.T_absorb).toBe(T_BASE_CARBONATED);
    expect(r.ethanol_factor).toBe(1.00);
  });
});

describe('resolveModifiers — per-drink food flag (§6.1)', () => {
  it('§6.1: food flag, non-carbonated → T_absorb = 90, factor = 0.85', () => {
    const r = resolveModifiers(0, false, [], true);
    expect(r.T_absorb).toBe(WITH_FOOD_FLAG.T_absorb.normal);        // 90
    expect(r.ethanol_factor).toBe(WITH_FOOD_FLAG.ethanol_factor);   // 0.85
  });

  it('§6.1: food flag + carbonated → T_absorb = 45, factor = 0.85', () => {
    const r = resolveModifiers(0, true, [], true);
    expect(r.T_absorb).toBe(WITH_FOOD_FLAG.T_absorb.carbonated);    // 45
    expect(r.ethanol_factor).toBe(WITH_FOOD_FLAG.ethanol_factor);   // 0.85
  });
});

describe('resolveModifiers — food log parameter application (§6.1)', () => {
  const mkEvent = (type, time_min) => ({ type, time_min });

  it('§6.1: snack covers non-carbonated drink → T=60, factor=0.97', () => {
    const r = resolveModifiers(0, false, [mkEvent('snack', 0)], false);
    expect(r.T_absorb).toBe(FOOD_PARAMS.snack.T_absorb);
    expect(r.ethanol_factor).toBe(FOOD_PARAMS.snack.ethanol_factor);
  });

  it('§6.1: light_meal covers non-carbonated drink → T=75, factor=0.95', () => {
    const r = resolveModifiers(0, false, [mkEvent('light_meal', 0)], false);
    expect(r.T_absorb).toBe(FOOD_PARAMS.light_meal.T_absorb);
    expect(r.ethanol_factor).toBe(FOOD_PARAMS.light_meal.ethanol_factor);
  });

  it('§6.1: full_meal covers non-carbonated drink → T=90, factor=0.92', () => {
    const r = resolveModifiers(0, false, [mkEvent('full_meal', 0)], false);
    expect(r.T_absorb).toBe(FOOD_PARAMS.full_meal.T_absorb);
    expect(r.ethanol_factor).toBe(FOOD_PARAMS.full_meal.ethanol_factor);
  });

  it('§6.1: heavy_meal covers non-carbonated drink → T=120, factor=0.90', () => {
    const r = resolveModifiers(0, false, [mkEvent('heavy_meal', 0)], false);
    expect(r.T_absorb).toBe(FOOD_PARAMS.heavy_meal.T_absorb);
    expect(r.ethanol_factor).toBe(FOOD_PARAMS.heavy_meal.ethanol_factor);
  });

  it('§6.1: full_meal covers carbonated drink → T=90 (food overrides carbonation)', () => {
    const r = resolveModifiers(0, true, [mkEvent('full_meal', 0)], false);
    expect(r.T_absorb).toBe(FOOD_PARAMS.full_meal.T_absorb);        // 90, not 20
    expect(r.ethanol_factor).toBe(FOOD_PARAMS.full_meal.ethanol_factor);
  });
});

describe('resolveModifiers — precedence and multiple events (§6.1)', () => {
  const mkEvent = (type, time_min) => ({ type, time_min });

  it('§6.1: food log event takes precedence over per-drink food flag', () => {
    const r = resolveModifiers(0, false, [mkEvent('snack', 0)], true);
    // snack, not WITH_FOOD_FLAG
    expect(r.T_absorb).toBe(FOOD_PARAMS.snack.T_absorb);
    expect(r.ethanol_factor).toBe(FOOD_PARAMS.snack.ethanol_factor);
  });

  it('§6.1: two covering events → most protective (heavy_meal) wins', () => {
    const r = resolveModifiers(0, false, [
      mkEvent('full_meal', 0),
      mkEvent('heavy_meal', 0),
    ], false);
    expect(r.T_absorb).toBe(FOOD_PARAMS.heavy_meal.T_absorb);
    expect(r.ethanol_factor).toBe(FOOD_PARAMS.heavy_meal.ethanol_factor);
  });

  it('§6.1: no covering event and no flag → fasted defaults', () => {
    // full_meal 3 hours ago, outside post_window
    const r = resolveModifiers(hm(22, 0), false, [mkEvent('full_meal', hm(19, 0))], false);
    expect(r.T_absorb).toBe(T_BASE_NORMAL);
    expect(r.ethanol_factor).toBe(1.00);
  });
});

// Helper
function hm(h, m) { return h * 60 + m; }
