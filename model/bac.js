/**
 * Alculator — BAC Simulation Engine
 * @module model/bac
 *
 * Orchestrates absorption, elimination, and food coverage models to compute
 * a full blood-alcohol concentration time series.  Pure functions only;
 * no side effects; no browser API usage.
 *
 * @see ABSORPTION_MODEL.md; RESEARCH.md §3.1; scripts/generate_curves.py
 */

import { SOBER_THRESHOLD, UNCERTAINTY_CV } from './constants.js';
import { ethanolG, absorptionFraction, resolveModifiers } from './absorption.js';
import { eliminationStep } from './elimination.js';
import { computeR } from './profile.js';

/**
 * Compute a minute-by-minute BAC time series.
 *
 * Algorithm (1-minute resolution):
 *   BAC[t] = max(0, BAC[t-1] + ΔBAC_abs(t) − ΔBAC_elim(t))
 *
 *   ΔBAC_abs(t)  = Σ_drinks  ethanol_g × factor × Δf(t)  / (weight_kg × 1000 × r) × 100
 *   ΔBAC_elim(t) = eliminationStep(BAC[t-1])
 *
 * where Δf(t) = absorptionFraction(t − t_drink) − absorptionFraction(t − 1 − t_drink)
 * using the closed-form convolution model (supports drinking duration).
 *
 * @param {Array<{
 *   time_min:    number,
 *   volume_ml:   number,
 *   abv_pct:     number,
 *   carbonated:  boolean,
 *   with_food:   boolean,
 *   duration_min?: number
 * }>} drinks
 * @param {Array<{ time_min: number, type: string }>} food_events
 * @param {{ sex: 'male'|'female', weight_kg: number, height_cm?: number, age?: number }} profile
 * @param {number} t_start_min  — first minute in the series (inclusive)
 * @param {number} t_end_min    — last minute in the series (inclusive)
 * @returns {Array<{ t_min: number, bac_pct: number }>}
 */
export function bacSeries(drinks, food_events, profile, t_start_min, t_end_min) {
  if (!drinks || drinks.length === 0) {
    const out = [];
    for (let t = t_start_min; t <= t_end_min; t++) out.push({ t_min: t, bac_pct: 0 });
    return out;
  }

  const r = computeR(profile);
  const { weight_kg } = profile;

  // Pre-resolve modifiers and ethanol mass for each drink
  const precomputed = drinks.map(d => {
    const { T_absorb, ethanol_factor } = resolveModifiers(
      d.time_min,
      d.carbonated ?? false,
      food_events,
      d.with_food ?? false,
    );
    return {
      time_min:      d.time_min,
      duration_min:  d.duration_min ?? 0,
      ethanol_g:     ethanolG(d.volume_ml, d.abv_pct),
      T_absorb,
      ethanol_factor,
    };
  });

  const series = [];
  let bac_prev = 0;

  for (let t = t_start_min; t <= t_end_min; t++) {
    // Absorption: sum incremental dose contributions from each drink
    let delta_abs = 0;
    for (const d of precomputed) {
      const elapsed_now  = t     - d.time_min;
      const elapsed_prev = t - 1 - d.time_min;
      const f_now  = absorptionFraction(elapsed_now,  d.T_absorb, d.duration_min);
      const f_prev = absorptionFraction(elapsed_prev, d.T_absorb, d.duration_min);
      const delta_f = f_now - f_prev;
      if (delta_f > 0) {
        delta_abs += d.ethanol_g * d.ethanol_factor * delta_f
                     / (weight_kg * 1000 * r) * 100;
      }
    }

    // Elimination: Michaelis-Menten decrement
    const delta_elim = eliminationStep(bac_prev);

    const bac_now = Math.max(0, bac_prev + delta_abs - delta_elim);
    series.push({ t_min: t, bac_pct: bac_now });
    bac_prev = bac_now;
  }

  return series;
}

/**
 * Find the time at which BAC drops below SOBER_THRESHOLD and stays there.
 *
 * Returns the t_min of the first point where bac_pct < SOBER_THRESHOLD after
 * the peak, or null if BAC never rises above the threshold.
 *
 * @param {Array<{ t_min: number, bac_pct: number }>} series
 * @returns {number|null}
 */
export function findSoberTime(series) {
  // Find last minute where BAC is at or above threshold
  let last_above = null;
  for (const { t_min, bac_pct } of series) {
    if (bac_pct >= SOBER_THRESHOLD) last_above = t_min;
  }
  if (last_above === null) return null;
  // Return the first minute after that point
  return last_above + 1;
}

/**
 * Compute the ±21 % individual-variation uncertainty bounds for a BAC value.
 *
 * Based on Gullberg 2015 coefficient of variation for population BAC estimates.
 *
 * @param {number} bac_pct  — central BAC estimate
 * @returns {{ lower: number, upper: number }}
 */
export function uncertaintyBounds(bac_pct) {
  return {
    lower: Math.max(0, bac_pct * (1 - UNCERTAINTY_CV)),
    upper: bac_pct * (1 + UNCERTAINTY_CV),
  };
}
