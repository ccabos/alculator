/**
 * Tests for model/food.js
 * Covers §6.1 "Food log — coverage window (Case A / Case B)" and
 *         §6.1 "Food log — precedence and multiple events"
 */

import { describe, it, expect } from 'vitest';
import { isCoveredCaseA, isCoveredCaseB, selectBestCovering } from '../../model/food.js';
import { FOOD_PARAMS } from '../../model/constants.js';

// Helper: convert HH:MM to minutes since midnight
const hm = (h, m) => h * 60 + m;

// ─── Case A ────────────────────────────────────────────────────────────────────

describe('isCoveredCaseA', () => {
  it('covers drink at food time (lower boundary)', () => {
    // Full meal at 19:00; drink at 19:00 — exactly at food time
    expect(isCoveredCaseA(hm(19, 0), hm(19, 0), 150)).toBe(true);
  });

  it('covers drink at post_window boundary (upper boundary)', () => {
    // Full meal at 19:00; drink at 21:30 — exactly 150 min later
    expect(isCoveredCaseA(hm(21, 30), hm(19, 0), 150)).toBe(true);
  });

  it('does NOT cover drink 1 min past post_window', () => {
    // Full meal at 19:00; drink at 21:31 — 151 min later
    expect(isCoveredCaseA(hm(21, 31), hm(19, 0), 150)).toBe(false);
  });

  it('covers drink within snack post_window (59 min)', () => {
    // Snack at 20:00; drink at 20:59 — within 60 min window
    expect(isCoveredCaseA(hm(20, 59), hm(20, 0), 60)).toBe(true);
  });

  it('does NOT cover drink exactly 1 min past snack post_window', () => {
    // Snack at 20:00; drink at 21:01 — 61 min later, past 60 min window
    expect(isCoveredCaseA(hm(21, 1), hm(20, 0), 60)).toBe(false);
  });

  it('does NOT cover drink consumed before the food event', () => {
    // Food at 20:00; drink at 19:00 — drink was before food (Case A requires t_food ≤ t_drink)
    expect(isCoveredCaseA(hm(19, 0), hm(20, 0), 150)).toBe(false);
  });
});

// ─── Case B ────────────────────────────────────────────────────────────────────

describe('isCoveredCaseB', () => {
  it('covers non-carbonated drink still absorbing when food arrives', () => {
    // Full meal at 20:00; drink started at 19:30; T_base=45 → ends at 20:15 ≥ 20:00
    expect(isCoveredCaseB(hm(19, 30), hm(20, 0), 45)).toBe(true);
  });

  it('does NOT cover non-carbonated drink fully absorbed before food', () => {
    // Full meal at 20:00; drink started at 19:00; T_base=45 → ends at 19:45 < 20:00
    expect(isCoveredCaseB(hm(19, 0), hm(20, 0), 45)).toBe(false);
  });

  it('covers carbonated drink still absorbing when food arrives', () => {
    // Full meal at 20:00; carbonated drink at 19:50; T_base=20 → ends at 20:10 ≥ 20:00
    expect(isCoveredCaseB(hm(19, 50), hm(20, 0), 20)).toBe(true);
  });

  it('does NOT cover carbonated drink already absorbed before food', () => {
    // Full meal at 20:00; carbonated drink at 19:30; T_base=20 → ends at 19:50 < 20:00
    expect(isCoveredCaseB(hm(19, 30), hm(20, 0), 20)).toBe(false);
  });

  it('covers drink at exact absorption boundary (t_drink + T_base = t_food)', () => {
    // T_base=45; drink at 19:15; food at 20:00 → 19:15+45=20:00 ≥ 20:00
    expect(isCoveredCaseB(hm(19, 15), hm(20, 0), 45)).toBe(true);
  });

  it('does NOT cover drink consumed after food (Case A territory)', () => {
    // t_drink >= t_food → Case B does not apply (requires t_drink < t_food)
    expect(isCoveredCaseB(hm(20, 0), hm(20, 0), 45)).toBe(false);
    expect(isCoveredCaseB(hm(20, 30), hm(20, 0), 45)).toBe(false);
  });
});

// ─── selectBestCovering ────────────────────────────────────────────────────────

describe('selectBestCovering', () => {
  it('returns the single event when only one covers the drink', () => {
    const result = selectBestCovering([FOOD_PARAMS.full_meal]);
    expect(result).toBe(FOOD_PARAMS.full_meal);
  });

  it('prefers lower ethanol_factor (heavy_meal over full_meal)', () => {
    const result = selectBestCovering([FOOD_PARAMS.full_meal, FOOD_PARAMS.heavy_meal]);
    expect(result).toBe(FOOD_PARAMS.heavy_meal);   // 0.90 < 0.92
  });

  it('prefers lower ethanol_factor regardless of order', () => {
    const result = selectBestCovering([FOOD_PARAMS.heavy_meal, FOOD_PARAMS.full_meal]);
    expect(result).toBe(FOOD_PARAMS.heavy_meal);
  });

  it('breaks ties on ethanol_factor by highest T_absorb (most protective)', () => {
    const a = { T_absorb: 60,  ethanol_factor: 0.90, post_window: 60  };
    const b = { T_absorb: 120, ethanol_factor: 0.90, post_window: 180 };
    // Same ethanol_factor → higher T_absorb wins (slower absorption = lower peak)
    expect(selectBestCovering([a, b])).toBe(b);
    expect(selectBestCovering([b, a])).toBe(b);
  });

  it('returns most protective across all four tiers (heavy_meal wins)', () => {
    const all = [
      FOOD_PARAMS.snack,
      FOOD_PARAMS.light_meal,
      FOOD_PARAMS.full_meal,
      FOOD_PARAMS.heavy_meal,
    ];
    const result = selectBestCovering(all);
    expect(result.ethanol_factor).toBe(FOOD_PARAMS.heavy_meal.ethanol_factor);
    expect(result.T_absorb).toBe(FOOD_PARAMS.heavy_meal.T_absorb);
  });
});
