/**
 * Alculator — Absorption Model
 * @module model/absorption
 *
 * Pure functions for ethanol dose, absorption fraction (with optional drinking
 * duration), and food modifier resolution.  No side effects; no browser API usage.
 */

import {
  ETHANOL_DENSITY,
  T_BASE_NORMAL,
  T_BASE_CARBONATED,
  FOOD_PARAMS,
  WITH_FOOD_FLAG,
} from './constants.js';

import { isCoveredCaseA, isCoveredCaseB, selectBestCovering } from './food.js';

// ─── Ethanol dose ──────────────────────────────────────────────────────────────

/**
 * Ethanol mass contained in a drink.
 * @param {number} volume_ml
 * @param {number} abv_pct  — e.g. 5.0 for 5 %
 * @returns {number} grams of ethanol
 */
export function ethanolG(volume_ml, abv_pct) {
  return volume_ml * (abv_pct / 100) * ETHANOL_DENSITY;
}

// ─── Base absorption time ──────────────────────────────────────────────────────

/**
 * Unmodified fasted absorption window for a drink.
 * @param {boolean} carbonated
 * @returns {number} minutes
 */
export function tBase(carbonated) {
  return carbonated ? T_BASE_CARBONATED : T_BASE_NORMAL;
}

// ─── Closed-form absorption fraction ──────────────────────────────────────────

/**
 * Antiderivative used by absorptionFraction for the extended-duration model.
 *
 *   H(x, T) = ∫₀ˣ max(0, min(1, u/T)) du
 *
 *            = 0              if x ≤ 0
 *            = x² / (2T)     if 0 < x ≤ T
 *            = x − T/2       if x > T
 *
 * @param {number} x
 * @param {number} T  — T_absorb
 * @returns {number}
 */
function H(x, T) {
  if (x <= 0) return 0;
  if (x <= T) return (x * x) / (2 * T);
  return x - T / 2;
}

/**
 * Fraction of a drink's ethanol absorbed at a given elapsed time.
 *
 * ── Instantaneous model (duration_min = 0) ────────────────────────────────────
 * The classic linear ramp: the entire ethanol dose enters the stomach at once
 * and is absorbed uniformly over T_absorb minutes.
 *
 *   f(elapsed) = clamp(elapsed / T_absorb, 0, 1)
 *
 * ── Extended-duration model (duration_min > 0) ────────────────────────────────
 * The ethanol dose enters the stomach uniformly while the drink is being
 * consumed (from t = 0 to t = duration_min).  Each sip starts its own
 * T_absorb ramp at the moment it is consumed.  The resulting absorbed fraction
 * is the convolution of the uniform intake rate with the linear absorption ramp,
 * computed analytically via the antiderivative H:
 *
 *   f(elapsed) = [ H(elapsed, T_absorb) − H(elapsed − duration_min, T_absorb) ]
 *                / duration_min
 *
 * This is exact (no numerical integration) and reduces continuously to the
 * instantaneous formula as duration_min → 0.
 *
 * Key properties compared to the midpoint approximation (placing the full dose
 * at elapsed = duration_min / 2):
 *   • Agrees exactly in the middle linear phase (duration_min ≤ elapsed ≤ T_absorb)
 *   • Starts absorbing at elapsed = 0 (first sip), not at elapsed = duration_min/2
 *   • Completes absorption at elapsed = duration_min + T_absorb (last sip fully
 *     absorbed), not at elapsed = duration_min/2 + T_absorb
 *   • The midpoint error in absorption timing is ≈ duration_min / 2; peak BAC
 *     error is typically ≤ 5 % for duration_min ≤ T_absorb / 2
 *
 * @param {number} elapsed_min   — minutes since the drink was *started* (≥ 0)
 * @param {number} T_absorb      — absorption window in minutes
 * @param {number} [duration_min=0] — drinking duration in minutes (0 = instantaneous)
 * @returns {number} absorbed fraction in [0, 1]
 * @see REQUIREMENTS.md §4.3.2; ABSORPTION_MODEL.md §2.3
 */
export function absorptionFraction(elapsed_min, T_absorb, duration_min = 0) {
  if (duration_min <= 0) {
    // Instantaneous: original linear-ramp formula
    return Math.min(1, Math.max(0, elapsed_min / T_absorb));
  }
  const D = duration_min;
  // Clamp to [0, 1] to guard against floating-point overshoot at boundaries
  return Math.min(1, Math.max(0,
    (H(elapsed_min, T_absorb) - H(elapsed_min - D, T_absorb)) / D
  ));
}

// ─── Food modifier resolution ──────────────────────────────────────────────────

/**
 * Resolve the effective {T_absorb, ethanol_factor} for a drink, applying food
 * coverage rules and the precedence hierarchy from REQUIREMENTS.md §4.8.2 / §4.3.2.
 *
 * Priority order (highest first):
 *   1. Food-log events that cover the drink via Case A or Case B
 *      — when multiple events cover the same drink, the most protective wins
 *        (lowest ethanol_factor; tie-break: highest T_absorb)
 *   2. Per-drink food flag (WITH_FOOD_FLAG constants) — applied when no food-log
 *      event covers the drink
 *   3. Fasted defaults — tBase() and ethanol_factor = 1.00
 *
 * Note: when a food-log event covers the drink, carbonation is overridden —
 * the food event's T_absorb applies regardless of whether the drink is carbonated.
 *
 * @param {number}  drink_time_min  — time the drink was *started*
 * @param {boolean} carbonated
 * @param {Array<{time_min: number, type: string}>} food_events
 * @param {boolean} with_food_flag
 * @returns {{ T_absorb: number, ethanol_factor: number }}
 */
export function resolveModifiers(drink_time_min, carbonated, food_events, with_food_flag) {
  const tb = tBase(carbonated);
  const covering = [];

  for (const fe of food_events) {
    const params = FOOD_PARAMS[fe.type];
    if (!params) continue;
    const caseA = isCoveredCaseA(drink_time_min, fe.time_min, params.post_window);
    const caseB = isCoveredCaseB(drink_time_min, fe.time_min, tb);
    if (caseA || caseB) covering.push(params);
  }

  if (covering.length > 0) {
    const best = selectBestCovering(covering);
    return { T_absorb: best.T_absorb, ethanol_factor: best.ethanol_factor };
  }

  if (with_food_flag) {
    return {
      T_absorb:       carbonated ? WITH_FOOD_FLAG.T_absorb.carbonated
                                 : WITH_FOOD_FLAG.T_absorb.normal,
      ethanol_factor: WITH_FOOD_FLAG.ethanol_factor,
    };
  }

  return { T_absorb: tb, ethanol_factor: 1.00 };
}
