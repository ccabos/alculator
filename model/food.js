/**
 * Alculator — Food Coverage Rules
 * @module model/food
 *
 * Pure functions implementing the physics-based Case A / Case B food coverage
 * rules from REQUIREMENTS.md §4.8.2.  No side effects; no browser API usage.
 */

/**
 * Case A: food was in the stomach before (or exactly when) the drink arrived,
 * and the drink was consumed within the food event's post-window.
 *
 *   t_food  ≤  t_drink  ≤  t_food + post_window
 *
 * @param {number} drink_time_min
 * @param {number} food_time_min
 * @param {number} post_window_min
 * @returns {boolean}
 */
export function isCoveredCaseA(drink_time_min, food_time_min, post_window_min) {
  return food_time_min <= drink_time_min &&
         drink_time_min <= food_time_min + post_window_min;
}

/**
 * Case B: the drink was started before the food arrived, but the drink was still
 * being absorbed (not yet fully absorbed) when food entered the stomach.
 *
 *   t_drink < t_food   AND   (t_drink + T_base) >= t_food
 *
 * T_base is the drink's unmodified fasted absorption window (45 min for
 * non-carbonated, 20 min for carbonated).  This ensures that only drinks whose
 * absorption is still ongoing when food arrives are covered — a drink already
 * fully absorbed gets no benefit from food eaten later.
 *
 * @param {number} drink_time_min  — time the drink was *started*
 * @param {number} food_time_min
 * @param {number} t_base_min      — unmodified fasted absorption time for the drink
 * @returns {boolean}
 */
export function isCoveredCaseB(drink_time_min, food_time_min, t_base_min) {
  return drink_time_min < food_time_min &&
         (drink_time_min + t_base_min) >= food_time_min;
}

/**
 * Given an array of food-parameter objects that all cover the same drink, return
 * the single most protective one.
 *
 * "Most protective" means lowest peak BAC, achieved by:
 *   Primary:   lowest ethanol_factor (smallest effective dose)
 *   Tie-break: highest T_absorb (slowest absorption → most concurrent elimination)
 *
 * Both T_absorb and ethanol_factor are taken from the same winning event
 * (REQUIREMENTS.md §4.8.2 — the event's parameters are applied as a unit).
 *
 * @param {Array<{ T_absorb: number, ethanol_factor: number, post_window: number }>} params
 * @returns {{ T_absorb: number, ethanol_factor: number, post_window: number }}
 */
export function selectBestCovering(params) {
  return params.reduce((best, p) => {
    if (p.ethanol_factor < best.ethanol_factor) return p;
    if (p.ethanol_factor === best.ethanol_factor && p.T_absorb > best.T_absorb) return p;
    return best;
  });
}
