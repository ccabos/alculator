/**
 * Alculator — Michaelis-Menten Elimination Model
 * @module model/elimination
 *
 * Pure functions for ethanol elimination kinetics.
 * No side effects; no browser API usage.
 *
 * The Michaelis-Menten (M-M) model captures both regimes of ADH kinetics:
 *   • High BAC (>> Km): ADH saturated → zero-order elimination at rate β_max
 *   • Low BAC (<< Km): ADH unsaturated → first-order (linear) elimination
 * This is more accurate than the classic Widmark β linear model, which
 * overestimates elimination at low BAC and produces a non-zero "sober" floor.
 *
 * @see RESEARCH.md §3.1; Holford 1987; Norberg et al. 2003
 */

import { BETA_MAX, KM } from './constants.js';

/**
 * Michaelis-Menten effective elimination rate at a given BAC.
 *
 *   β_eff(c) = β_max × c / (c + Km)
 *
 * Behaviour:
 *   c = 0       → β_eff = 0  (no ADH substrate; ADH is idle)
 *   c = Km      → β_eff = β_max / 2  (half-saturation)
 *   c >> Km     → β_eff → β_max  (full saturation; effectively zero-order)
 *
 * @param {number} bac_pct  — current BAC in % (e.g. 0.08)
 * @returns {number}        — elimination rate in % BAC per hour
 */
export function betaEff(bac_pct) {
  if (bac_pct <= 0) return 0;
  return BETA_MAX * bac_pct / (bac_pct + KM);
}

/**
 * Elimination decrement for one simulation minute.
 *
 *   eliminationStep(c) = β_eff(c) / 60
 *
 * Returns the BAC reduction (in %) that occurs during a single 1-minute
 * interval at the current BAC level.
 *
 * @param {number} bac_pct  — current BAC in %
 * @returns {number}        — BAC reduction for this minute (in %, always ≥ 0)
 */
export function eliminationStep(bac_pct) {
  return betaEff(bac_pct) / 60;
}
