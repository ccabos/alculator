/**
 * Alculator — Body-Water Distribution (r) Model
 * @module model/profile
 *
 * Pure functions for computing the Widmark r factor (volume of distribution
 * for ethanol) from individual body measurements.
 * No side effects; no browser API usage.
 *
 * Preferred hierarchy:
 *   1. Seidl formula (uses weight + height + sex)  — most accurate
 *   2. Widmark population means (sex only)         — fallback when height unknown
 *
 * Watson TBW is computed as an informational cross-check and is not used in
 * the BAC simulation directly; r is derived from Seidl or Widmark.
 *
 * @see RESEARCH.md §2, §8; Seidl et al. 2000; Watson et al. 1980; Widmark 1932
 */

import { WIDMARK_R, BLOOD_WATER_FRACTION } from './constants.js';

/**
 * Seidl et al. 2000 formula for the Widmark r factor.
 *
 * Male:   r = 0.31608 − 0.004821 × W + 0.4632 × H
 * Female: r = 0.31223 − 0.006446 × W + 0.4466 × H
 *
 * where W = weight in kg, H = height in m.
 *
 * @param {{ sex: 'male'|'female', weight_kg: number, height_cm: number }} profile
 * @returns {number} Widmark r (dimensionless)
 * @see RESEARCH.md §8; Seidl et al. 2000
 */
export function seidlR({ sex, weight_kg, height_cm }) {
  const H = height_cm / 100; // convert cm → m
  if (sex === 'male') {
    return 0.31608 - 0.004821 * weight_kg + 0.4632 * H;
  }
  return 0.31223 - 0.006446 * weight_kg + 0.4466 * H;
}

/**
 * Watson et al. 1980 total body water (TBW) formula.
 *
 * Male:   TBW = 2.447 − 0.09516 × age + 0.1074 × H + 0.3362 × W
 * Female: TBW = −2.097 + 0.1069 × H + 0.2466 × W
 *
 * where H = height in cm, W = weight in kg, age = years.
 *
 * @param {{ sex: 'male'|'female', age: number, weight_kg: number, height_cm: number }} profile
 * @returns {number} Total body water in litres
 * @see RESEARCH.md §2.2; Watson et al. 1980
 */
export function watsonTBW({ sex, age, weight_kg, height_cm }) {
  if (sex === 'male') {
    return 2.447 - 0.09516 * age + 0.1074 * height_cm + 0.3362 * weight_kg;
  }
  return -2.097 + 0.1069 * height_cm + 0.2466 * weight_kg;
}

/**
 * Select the best available r estimate for the given profile.
 *
 * Uses Seidl when height_cm is provided and positive; falls back to the
 * Widmark population means otherwise.
 *
 * @param {{ sex: 'male'|'female', weight_kg: number, height_cm?: number }} profile
 * @returns {number} Widmark r (dimensionless)
 */
export function computeR(profile) {
  if (profile.height_cm && profile.height_cm > 0) {
    return seidlR(profile);
  }
  return WIDMARK_R[profile.sex];
}
