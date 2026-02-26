/**
 * Alculator — Pharmacokinetic Model Constants
 * @module model/constants
 *
 *
 * SINGLE SOURCE OF TRUTH for all BAC model parameters.
 *
 * Updating a value here automatically propagates to every model function and
 * every test that derives its expected value from these constants.  No other
 * file in model/, store/, io/, or ui/ may define or hardcode pharmacokinetic
 * parameter values.  (AR-01, REQUIREMENTS.md §7.2)
 *
 * ─── Update workflow ──────────────────────────────────────────────────────────
 * When new research revises a parameter:
 *   1. Edit the value below.
 *   2. Update the @see / @update JSDoc field to the new citation.
 *   3. Run `npm test` — failing tests show exactly what behaviour changed.
 *   4. For each failing test, confirm the new behaviour is correct, then update
 *      the expected value in the test file.
 *   5. Add an entry to the REQUIREMENTS.md changelog (§ "Changelog vX.Y → vX.Z").
 *   6. Update RESEARCH.md §10 "Key quantitative parameters" if the citation is new.
 * ──────────────────────────────────────────────────────────────────────────────
 */

// ─── Physical constants ────────────────────────────────────────────────────────

/**
 * Density of pure ethanol.
 * @type {number}
 * @unit g/mL
 * @see Lide 2005 — CRC Handbook of Chemistry and Physics, 85th ed.
 * @update Physical constant; does not change.
 */
export const ETHANOL_DENSITY = 0.789;

/**
 * Fraction of blood that is water.  Used in the Widmark/Watson r calculation
 * to convert total body water (TBW) into volume of distribution for ethanol.
 * @type {number}
 * @unit dimensionless
 * @see Watson et al. 1980; RESEARCH.md §2.2
 * @update Would require revised haematological data; unlikely to change.
 */
export const BLOOD_WATER_FRACTION = 0.80;

// ─── Michaelis-Menten elimination model ───────────────────────────────────────

/**
 * Maximum elimination rate of ethanol (β_max): the rate at which blood-ethanol
 * falls when hepatic ADH is fully saturated (BAC >> Km).  At high BAC this is
 * effectively the classic Widmark β constant.
 * @type {number}
 * @unit % BAC per hour
 * @range [0.010, 0.020] in the general population
 * @see RESEARCH.md §3.1, §10; Holford 1987; Jones & Andersson 1996
 * @update If a meta-analysis substantially revises the population mean, change
 *         this value and update REQUIREMENTS.md §4.3.3.  Any change here will
 *         shift every BAC curve — run the full integration test suite.
 */
export const BETA_MAX = 0.015;

/**
 * ADH half-saturation constant (Km): the BAC at which elimination rate equals
 * β_max / 2.  Below this BAC, ADH is undersaturated and elimination slows
 * dramatically (first-order / Michaelis-Menten regime).
 * @type {number}
 * @unit % BAC   (≈ 10–15 mg/dL)
 * @see RESEARCH.md §3.1 ("Only at very low BAC < 10–20 mg/dL does the enzyme
 *      become unsaturated"); Norberg et al. 2003
 * @update Requires new ADH enzyme-kinetics data; rarely revised.
 */
export const KM = 0.015;

// ─── Absorption model ──────────────────────────────────────────────────────────

/**
 * Baseline absorption window for a non-carbonated drink consumed while fasted.
 * The linear-ramp model goes from 0 % → 100 % absorbed over this interval.
 * @type {number}
 * @unit minutes
 * @range [30, 60] per clinical gastric-emptying literature
 * @see RESEARCH.md §1.1, §1.2; Kalant 1971; Levitt & Levitt 2020
 * @update Increase if systematic overestimation of early BAC is observed;
 *         change only with supporting gastric-emptying citation.
 */
export const T_BASE_NORMAL = 45;

/**
 * Baseline absorption window for a carbonated drink (e.g. champagne, beer)
 * consumed while fasted.  Carbonation accelerates gastric emptying.
 * @type {number}
 * @unit minutes
 * @see RESEARCH.md §1.4; Ridout et al. 2003
 * @update If subsequent studies do not replicate Ridout's carbonation effect,
 *         this value could be raised toward T_BASE_NORMAL.
 */
export const T_BASE_CARBONATED = 20;

// ─── Distribution (r factor) ──────────────────────────────────────────────────

/**
 * Widmark r factor fallback values for when height is not provided.
 * These are population-mean estimates; Seidl/Watson are preferred when height
 * is known.
 * @type {{ male: number, female: number }}
 * @unit dimensionless (mL blood / mL total body water)
 * @see RESEARCH.md §8; Widmark 1932
 * @update Use Seidl (model/profile.js) whenever height is available; these
 *         values are only a last resort.
 */
export const WIDMARK_R = Object.freeze({ male: 0.68, female: 0.55 });

// ─── Per-drink food flag (fallback when no food-log event covers the drink) ────

/**
 * Modifiers applied when the user sets the per-drink "eating alongside" flag
 * but no food-log event with a timestamp covers the drink.  This is a coarse
 * fallback; food-log events (FOOD_PARAMS) take precedence.
 *
 * T_absorb.normal     — absorption window for non-carbonated drinks with food
 * T_absorb.carbonated — absorption window for carbonated drinks with food
 *                       (food overrides the carbonation acceleration)
 * ethanol_factor      — dose multiplier representing first-pass metabolism;
 *                       the remaining peak reduction comes from slower T_absorb
 *
 * @type {{ T_absorb: { normal: number, carbonated: number }, ethanol_factor: number }}
 * @see REQUIREMENTS.md §4.3.2 FR-30–32; RESEARCH.md §1.3
 * @update Adjust in concert with FOOD_PARAMS if the FPM literature changes.
 */
export const WITH_FOOD_FLAG = Object.freeze({
  T_absorb: { normal: 90, carbonated: 45 },
  ethanol_factor: 0.85,
});

// ─── Meal-size food parameters ────────────────────────────────────────────────

/**
 * Parameters for each meal-size tier, applied when a food-log event covers a
 * drink via the Case A or Case B rule (REQUIREMENTS.md §4.8.2).
 *
 * T_absorb       — absorption window applied to covered drinks (minutes)
 * ethanol_factor — incremental first-pass metabolism multiplier
 *                  (represents only the extra FPM from food, NOT the total
 *                   peak-BAC reduction; the remainder comes from extended
 *                   T_absorb allowing concurrent M-M elimination)
 * post_window    — how long after the food event new drinks are still covered
 *                  (minutes)
 *
 * @type {Object.<string, { T_absorb: number, ethanol_factor: number, post_window: number }>}
 * @see REQUIREMENTS.md §4.8.2; RESEARCH.md §1.3
 *      T_absorb source: Levitt & Levitt 2020 — gastric emptying with food
 *      ethanol_factor source: Frezza 1990 — incremental gastric FPM;
 *        fasted FPM ≈ 5–10 %; food adds ~3–12 % extra; total = 0.90–0.97
 *      post_window: clinical observation; food slows motility for 1–3 h
 * @update If a clinical study substantially revises gastric emptying times for
 *         a specific meal tier, update T_absorb for that tier and add a
 *         REQUIREMENTS.md changelog entry.  Run the full integration suite.
 */
export const FOOD_PARAMS = Object.freeze({
  snack:      { T_absorb:  60, ethanol_factor: 0.97, post_window:  60 },
  light_meal: { T_absorb:  75, ethanol_factor: 0.95, post_window:  90 },
  full_meal:  { T_absorb:  90, ethanol_factor: 0.92, post_window: 150 },
  heavy_meal: { T_absorb: 120, ethanol_factor: 0.90, post_window: 180 },
});

/** Meal size keys as a frozen array — used for schema validation. */
export const MEAL_SIZES = Object.freeze(Object.keys(FOOD_PARAMS));

// ─── Uncertainty ──────────────────────────────────────────────────────────────

/**
 * Coefficient of variation representing individual biological variability in
 * the BAC estimate.  The uncertainty band is BAC × (1 ± UNCERTAINTY_CV).
 * @type {number}
 * @unit dimensionless  (21 %)
 * @see REQUIREMENTS.md §4.3.4 FR-38; Gullberg 2015
 * @update Would require a new population-level measurement study.
 */
export const UNCERTAINTY_CV = 0.21;

// ─── Display thresholds ───────────────────────────────────────────────────────

/**
 * BAC boundaries for the colour-coded safety indicator.
 * Values are the lower bound of each category (inclusive).
 * These are informational only — not legal limits.
 *
 * | BAC         | Colour    | Label                 |
 * |-------------|-----------|-----------------------|
 * | = 0.00 %    | Green     | Sober                 |
 * | 0.01–0.05 % | Yellow    | Light buzz            |
 * | 0.06–0.08 % | Orange    | Tipsy                 |
 * | 0.09–0.15 % | Red       | Drunk                 |
 * | > 0.15 %    | Dark red  | Heavily intoxicated   |
 *
 * @see REQUIREMENTS.md §4.4 FR-44
 * @update Adjust only if evidence-based recommendations change.
 */
export const BAC_THRESHOLDS = Object.freeze({
  sober:  0.00,
  buzz:   0.01,
  tipsy:  0.06,
  drunk:  0.09,
  heavy:  0.15,
});

/**
 * BAC below which a person is considered "sober" for sober-time calculation.
 * Kept separate from BAC_THRESHOLDS so the simulation engine can use it
 * without coupling to UI threshold semantics.
 * @type {number}
 * @unit % BAC
 */
export const SOBER_THRESHOLD = 0.001;

// ─── Drink preset library ──────────────────────────────────────────────────────

/**
 * Built-in drink presets — the factory default preset library.
 *
 * Each preset has a stable `id` that must not be changed once shipped (renaming
 * an id would orphan user customisations stored in localStorage that reference it).
 *
 * duration_min: the typical time a person takes to finish this drink, used by the
 *   closed-form convolution model (model/absorption.js absorptionFraction).
 *   The user can override this at logging time.  0 means "instantaneous" (legacy
 *   behaviour, but no drink is really instantaneous — 0 is reserved for shots).
 *
 * @type {ReadonlyArray<{id:string, name:string, volume_ml:number, abv_pct:number,
 *                       carbonated:boolean, duration_min:number}>}
 * @see REQUIREMENTS.md §4.10
 * @update To add a new built-in preset, append a new object with a unique id.
 *         Do NOT change existing ids.  Volume/ABV/duration values may be revised
 *         without stability concerns (they are user-overridable defaults only).
 */
export const DEFAULT_DRINK_PRESETS = Object.freeze([
  { id: 'beer_regular',  name: 'Beer (regular)',  volume_ml: 330, abv_pct:  5.0, carbonated: false, duration_min: 20 },
  { id: 'beer_pint',     name: 'Beer (pint)',      volume_ml: 568, abv_pct:  5.0, carbonated: false, duration_min: 30 },
  { id: 'wine_glass',    name: 'Wine (glass)',     volume_ml: 150, abv_pct: 12.0, carbonated: false, duration_min: 15 },
  { id: 'wine_large',    name: 'Wine (large)',     volume_ml: 250, abv_pct: 12.0, carbonated: false, duration_min: 20 },
  { id: 'champagne',     name: 'Champagne',        volume_ml: 150, abv_pct: 12.0, carbonated: true,  duration_min: 10 },
  { id: 'spirit_shot',   name: 'Shot',             volume_ml:  40, abv_pct: 40.0, carbonated: false, duration_min:  2 },
  { id: 'spirit_double', name: 'Double shot',      volume_ml:  70, abv_pct: 40.0, carbonated: false, duration_min:  2 },
  { id: 'cocktail',      name: 'Cocktail',         volume_ml: 200, abv_pct: 12.0, carbonated: false, duration_min: 20 },
  { id: 'cider_can',     name: 'Cider (can)',      volume_ml: 440, abv_pct:  4.5, carbonated: false, duration_min: 25 },
]);

/**
 * Suggested values for the drinking-duration quick-select control in the UI.
 * The user can also type any non-negative integer.
 * @type {ReadonlyArray<number>}
 * @unit minutes
 */
export const DURATION_QUICK_SELECT_MIN = Object.freeze([0, 5, 10, 15, 20, 30, 45, 60]);
