/**
 * Integration tests — Reference scenario regression suite
 *
 * Reproduces the 6 documented scenarios from scripts/generate_curves.py using
 * the JavaScript bacSeries() implementation and compares peak BAC against the
 * Python reference output (tolerance ±0.001 %).
 *
 * These tests serve as a permanent regression guard: if a future code change
 * shifts any peak by more than ±0.001 %, this test fails and the developer must
 * confirm the change is intentional.
 *
 * All times are in minutes from midnight.
 * Profile: male, 70 kg, 175 cm, age 30  (r ≈ 0.789 via Seidl 2000)
 * Python reference peaks (scripts/generate_curves.py, r = 0.789):
 *   Ex 1: 0.0524 %   Ex 2: 0.0378 %   Ex 3: 0.0387 %
 *   Ex 4: 0.0422 %   Ex 5: 0.0521 %   Ex 6: 0.0397 %
 */

import { describe, it, expect } from 'vitest';
import { bacSeries } from '../../model/bac.js';

// Shared profile — matches the Python reference script's profile
const PROFILE = { sex: 'male', weight_kg: 70, height_cm: 175, age: 30 };

// Helper: build a drink entry (instantaneous, no food flag, matches Python defaults)
const wine = (time_min, volume_ml = 150, carbonated = false) => ({
  time_min,
  volume_ml,
  abv_pct: 12,
  carbonated,
  with_food: false,
  duration_min: 0, // instantaneous (matches Python's absorbed_fraction)
});

// Helper: run simulation with enough time to capture the full curve, return peak
function peakBAC(drinks, food_events) {
  const t_start = Math.min(...drinks.map(d => d.time_min), ...(food_events.map(f => f.time_min))) - 30;
  const t_end   = t_start + 600; // 10 h window — enough to cover all scenarios
  const series  = bacSeries(drinks, food_events, PROFILE, t_start, t_end);
  return Math.max(...series.map(p => p.bac_pct));
}

// Tolerance: ±0.001 % BAC  (matches plan requirement)
const TOL = 0.001;

// ─── Scenario 1: Three wines, fasted ──────────────────────────────────────────

describe('Scenario 1 — Three wines, fasted (baseline)', () => {
  it('peak BAC matches Python reference (0.0524 %)', () => {
    const drinks = [
      wine(1140), // 19:00
      wine(1200), // 20:00
      wine(1260), // 21:00
    ];
    expect(peakBAC(drinks, [])).toBeCloseTo(0.0524, 3); // 3 decimal places → ±0.0005
  });
});

// ─── Scenario 2: Heavy meal 30 min before drinking ────────────────────────────

describe('Scenario 2 — Heavy meal at 18:30, drinks at 19:00/20:00/21:00', () => {
  it('peak BAC matches Python reference (0.0378 %)', () => {
    const drinks = [wine(1140), wine(1200), wine(1260)];
    const food   = [{ time_min: 1110, type: 'heavy_meal' }];
    expect(peakBAC(drinks, food)).toBeCloseTo(0.0378, 3);
  });
});

// ─── Scenario 3: Drink 1 h before eating — not covered ───────────────────────

describe('Scenario 3 — Wine 1 (19:00) fully absorbed before meal (20:00): not covered', () => {
  it('peak BAC matches Python reference (0.0387 %)', () => {
    const drinks = [
      wine(1140), // 19:00 — fully absorbed by 20:00; Case B does NOT apply
      wine(1230), // 20:30
      wine(1290), // 21:30
    ];
    const food = [{ time_min: 1200, type: 'full_meal' }];
    expect(peakBAC(drinks, food)).toBeCloseTo(0.0387, 3);
  });
});

// ─── Scenario 4: Drink 30 min before eating — IS covered (Case B) ─────────────

describe('Scenario 4 — Wine 1 (19:30) still absorbing when meal arrives (20:00): Case B', () => {
  it('peak BAC matches Python reference (0.0422 %)', () => {
    const drinks = [
      wine(1170), // 19:30 — 30 min before meal; T_base=45 → still absorbing at 20:00
      wine(1230), // 20:30
      wine(1290), // 21:30
    ];
    const food = [{ time_min: 1200, type: 'full_meal' }];
    expect(peakBAC(drinks, food)).toBeCloseTo(0.0422, 3);
  });
});

// ─── Scenario 5: Snack mid-session (limited post_window = 60 min) ─────────────

describe('Scenario 5 — Snack at 19:30: Wines 1 & 2 covered, Wine 3 fasted', () => {
  it('peak BAC matches Python reference (0.0521 %)', () => {
    const drinks = [
      wine(1140), // 19:00 — covered by Case A (snack at 19:30 within 60 min post_window)
      wine(1200), // 20:00 — covered by Case A (exactly at boundary: 1170+60=1230)
      wine(1260), // 21:00 — NOT covered (1260 > 1170+60)
    ];
    const food = [{ time_min: 1170, type: 'snack' }];
    expect(peakBAC(drinks, food)).toBeCloseTo(0.0521, 3);
  });
});

// ─── Scenario 6: Champagne at dinner (food overrides carbonation) ──────────────

describe('Scenario 6 — Champagne (19:00) + wines at dinner, full_meal at 18:30', () => {
  it('peak BAC matches Python reference (0.0397 %)', () => {
    const drinks = [
      wine(1140, 125, true), // 19:00 — 125 mL champagne (carbonated)
      wine(1200, 150, false), // 20:00 — wine
      wine(1260, 150, false), // 21:00 — wine
    ];
    const food = [{ time_min: 1110, type: 'full_meal' }]; // 18:30
    expect(peakBAC(drinks, food)).toBeCloseTo(0.0397, 3);
  });
});
