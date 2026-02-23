# Alculator — Software Architecture
*Version 1.0 · 2026-02-23*

---

## 1. Overview

### 1.1 Purpose of This Document

This document describes the module structure for the Alculator JavaScript
implementation, explains the design decisions behind it, and provides a
step-by-step guide for maintaining and updating the pharmacokinetic model
as new research becomes available.

The model specification itself lives in REQUIREMENTS.md (§4.3, §4.8) and
ABSORPTION_MODEL.md.  The research basis lives in RESEARCH.md.  This
document covers *how the code is organised* to honour that specification.

### 1.2 The Central Design Principle

> **All pharmacokinetic constants live in one file: `model/constants.js`.**

This is the single most important structural decision.  Every other module
imports from `model/constants.js`; no other file may hardcode a model
parameter value.  When a clinical study revises, say, the gastric emptying
time for a full meal, a developer edits exactly one line in one file, runs
`npm test`, and the updated behaviour propagates everywhere automatically.

### 1.3 Why Not a Configuration File?

Model parameters are not user configuration — they are scientific constants
derived from peer-reviewed literature.  They live in a JavaScript module
rather than a JSON/YAML config file so that:

- JSDoc annotations can document the citation, unit, range, and update
  conditions directly alongside each value
- `Object.freeze()` prevents accidental mutation at runtime
- Tests can import the same constants and derive expected values from them,
  ensuring tests always stay in sync with the model

---

## 2. Module Map

### 2.1 Directory Tree

```
alculator/
│
├── model/                    ← Pure pharmacokinetic logic
│   ├── constants.js          ← SINGLE SOURCE OF TRUTH for model parameters
│   ├── profile.js            ← r-factor computation (Seidl, Watson, Widmark)
│   ├── absorption.js         ← Ethanol dose, linear ramp, food modifiers
│   ├── elimination.js        ← Michaelis-Menten kinetics
│   ├── food.js               ← Food coverage rules (Case A / Case B)
│   └── bac.js               ← BAC simulation engine
│
├── store/
│   └── session.js            ← localStorage CRUD for session state
│
├── io/
│   └── session_io.js         ← JSON export, import, schema validation
│
├── ui/                       ← (implementation detail; no model logic)
│   ├── chart.js              ← BAC curve rendering (SVG or Canvas)
│   ├── form.js               ← Drink / food entry forms
│   └── display.js            ← BAC readout, colour coding, sober time
│
├── tests/
│   ├── unit/
│   │   ├── profile.test.js
│   │   ├── ethanol.test.js
│   │   ├── absorption.test.js
│   │   ├── elimination.test.js
│   │   ├── food.test.js
│   │   ├── bac.test.js
│   │   └── io.test.js
│   └── integration/
│       └── scenarios.test.js
│
├── scripts/
│   └── generate_curves.py    ← Python reference implementation (read-only)
│
├── package.json
├── vitest.config.js
├── REQUIREMENTS.md
├── ARCHITECTURE.md           ← this document
├── ABSORPTION_MODEL.md
├── MANUAL.md
└── RESEARCH.md
```

### 2.2 Layered Dependency Diagram

Arrows mean "imports from".  No reverse arrows are permitted.

```
  ┌──────────────────────────────────────────────────┐
  │                    ui/                            │
  │  chart.js   form.js   display.js                 │
  └───────────┬────────────────┬─────────────────────┘
              │                │
    ┌─────────▼──────┐  ┌─────▼──────────┐
    │   store/       │  │     io/         │
    │  session.js    │  │ session_io.js   │
    └─────────┬──────┘  └────────┬───────┘
              │                  │
              └────────┬─────────┘
                       │
  ┌────────────────────▼─────────────────────────────┐
  │                   model/                          │
  │  profile.js  absorption.js  elimination.js        │
  │  food.js     bac.js                               │
  └────────────────────┬─────────────────────────────┘
                       │
              ┌────────▼────────┐
              │ model/          │
              │ constants.js    │
              └─────────────────┘
```

**Layer rules (enforced by REQUIREMENTS.md AR-01 – AR-04):**

| Layer | May import from | Must NOT import from |
|-------|----------------|----------------------|
| `model/` | `model/constants.js` only | `store/`, `io/`, `ui/`, browser APIs |
| `store/` | `model/` | `io/`, `ui/` |
| `io/` | `model/` | `store/`, `ui/` |
| `ui/` | `model/`, `store/`, `io/` | — |
| `tests/` | `model/`, `io/` | `ui/`, `store/` |

---

## 3. Model Layer (`model/`)

The model layer has one invariant that must never be violated:

> **All functions in `model/` are pure.**  Given the same arguments they
> return the same value.  They do not read or write DOM, `localStorage`,
> `window`, `document`, `fetch`, or any other browser API.  They do not
> mutate their arguments.  They have no observable side effects.

This invariant is what makes the model testable in a plain Node.js
environment (no browser, no JSDOM) and what allows `npm test` to run in CI
without a headless browser.

### 3.1 `model/constants.js` — Full Annotated Listing

See the file itself for the complete, annotated source.  Every constant
follows this documentation pattern:

```js
/**
 * One-sentence description of what this constant represents physiologically.
 * @type {number | Object}
 * @unit   the physical unit (e.g. "g/mL", "% BAC per hour", "minutes")
 * @range  [low, high] population range where applicable
 * @see    RESEARCH.md §X.Y and the primary citation
 * @update Condition under which this value should be revised and what to do
 */
export const NAME = value;
```

Constants defined in `model/constants.js`:

| Constant | Value | Unit | Citation |
|----------|-------|------|----------|
| `ETHANOL_DENSITY` | 0.789 | g/mL | Lide 2005, CRC Handbook |
| `BLOOD_WATER_FRACTION` | 0.80 | — | Watson 1980; RESEARCH.md §2.2 |
| `BETA_MAX` | 0.015 | %/h | Holford 1987; RESEARCH.md §3.1, §10 |
| `KM` | 0.015 | % BAC | Norberg 2003; RESEARCH.md §3.1 |
| `T_BASE_NORMAL` | 45 | min | Kalant 1971; RESEARCH.md §1.1 |
| `T_BASE_CARBONATED` | 20 | min | Ridout 2003; RESEARCH.md §1.4 |
| `WIDMARK_R` | {male: 0.68, female: 0.55} | — | Widmark 1932; RESEARCH.md §8 |
| `WITH_FOOD_FLAG` | {T_absorb: {normal:90, carbonated:45}, factor:0.85} | — | REQUIREMENTS.md §4.3.2 |
| `FOOD_PARAMS` | {snack/light/full/heavy} | — | Frezza 1990; RESEARCH.md §1.3 |
| `UNCERTAINTY_CV` | 0.21 | — | Gullberg 2015; REQUIREMENTS.md §4.3.4 |
| `BAC_THRESHOLDS` | {sober/buzz/tipsy/drunk/heavy} | % BAC | REQUIREMENTS.md §4.4 |
| `SOBER_THRESHOLD` | 0.001 | % BAC | Used by findSoberTime() |
| `DEFAULT_DRINK_PRESETS` | 9-entry frozen array | — | REQUIREMENTS.md §4.10.1 |
| `DURATION_QUICK_SELECT_MIN` | [0,5,10,15,20,30,45,60] | min | UI quick-select options |

### 3.2 `model/profile.js` — Distribution Factor

Computes the volume-of-distribution factor *r* from user profile data.

```js
/**
 * Seidl et al. 2000 formula — preferred when height is known.
 * @param {{ sex: 'male'|'female', weight_kg: number, height_cm: number }} profile
 * @returns {number} r (dimensionless)
 */
export function seidlR({ sex, weight_kg, height_cm })
// male:   r = 0.32 − 0.0048 × weight_kg + 0.0046 × height_cm
// female: r = 0.31 − 0.0064 × weight_kg + 0.0045 × height_cm

/**
 * Watson et al. 1980 total body water formula — used as cross-check.
 * @param {{ sex: 'male'|'female', age: number, weight_kg: number, height_cm: number }} profile
 * @returns {number} TBW in litres
 */
export function watsonTBW({ sex, age, weight_kg, height_cm })
// male:   TBW = 2.447 − 0.09516×age + 0.1074×height_cm + 0.3362×weight_kg
// female: TBW = −2.097 + 0.1069×height_cm + 0.2466×weight_kg

/**
 * Select the best available r for a profile.
 * Uses Seidl when height is provided; falls back to WIDMARK_R otherwise.
 * Watson TBW is computed and attached as a cross-check annotation but does
 * not override Seidl.
 * @param {{ sex: 'male'|'female', weight_kg: number, height_cm?: number, age?: number }} profile
 * @returns {number} r (dimensionless)
 */
export function computeR(profile)
```

### 3.3 `model/absorption.js` — Dose and Absorption Ramp

```js
/**
 * Ethanol mass in a drink.
 * @param {number} volume_ml
 * @param {number} abv_pct  — e.g. 5.0 for 5 %
 * @returns {number} grams of ethanol
 */
export function ethanolG(volume_ml, abv_pct)
// = volume_ml × (abv_pct / 100) × ETHANOL_DENSITY

/**
 * Unmodified fasted absorption window.
 * @param {boolean} carbonated
 * @returns {number} minutes  (T_BASE_CARBONATED or T_BASE_NORMAL)
 */
export function tBase(carbonated)

/**
 * Absorbed fraction at elapsed time, with optional drinking duration.
 * When duration_min = 0 (default): linear ramp f = clamp(elapsed/T_absorb, 0, 1).
 * When duration_min > 0: exact closed-form convolution for a drink consumed
 * uniformly over duration_min minutes — see REQUIREMENTS.md §4.3.2 FR-27b.
 * Absorption completes at elapsed = duration_min + T_absorb.
 * @param {number} elapsed_min   — minutes since drink was *started*
 * @param {number} T_absorb     — absorption window in minutes
 * @param {number} [duration_min=0] — drinking duration in minutes
 * @returns {number} fraction in [0, 1]
 */
export function absorptionFraction(elapsed_min, T_absorb, duration_min = 0)

/**
 * Resolve effective {T_absorb, ethanol_factor} for a drink, applying food
 * coverage rules and precedence (REQUIREMENTS.md §4.8.2, §4.3.2).
 *
 * Priority order:
 *   1. Food-log events that cover the drink (Case A or Case B) — most
 *      protective event wins (lowest ethanol_factor)
 *   2. Per-drink food flag (WITH_FOOD_FLAG) if no food-log event covers
 *   3. Fasted defaults (tBase(), factor = 1.00)
 *
 * @param {number}  drink_time_min
 * @param {boolean} carbonated
 * @param {Array<{time_min: number, type: string}>} food_events
 * @param {boolean} with_food_flag
 * @returns {{ T_absorb: number, ethanol_factor: number }}
 */
export function resolveModifiers(drink_time_min, carbonated, food_events, with_food_flag)
```

### 3.4 `model/elimination.js` — Michaelis-Menten Kinetics

```js
/**
 * Effective elimination rate at the current BAC level.
 * β_eff = BETA_MAX × bac / (bac + KM)
 *
 * Behaviour:
 *   bac >> KM  → β_eff ≈ BETA_MAX  (classical zero-order / Widmark regime)
 *   bac = KM   → β_eff = BETA_MAX / 2
 *   bac << KM  → β_eff ≈ BETA_MAX × bac / KM  (first-order; near-zero elim)
 *
 * The near-zero elimination at low BAC is critical for food-delayed scenarios:
 * it allows BAC to rise even when per-minute absorption is slower than the
 * saturation-level elimination rate.  See ABSORPTION_MODEL.md §2.4.
 *
 * @param {number} bac_pct — current BAC in % (must be ≥ 0)
 * @returns {number} effective elimination rate in %/h
 */
export function betaEff(bac_pct)

/**
 * BAC eliminated in one simulation minute at the current BAC.
 * = betaEff(bac_pct) / 60
 * @param {number} bac_pct
 * @returns {number} % BAC eliminated this minute
 */
export function eliminationStep(bac_pct)
```

### 3.5 `model/food.js` — Food Coverage Rules

Implements the physics-based Case A / Case B coverage rules from
REQUIREMENTS.md §4.8.2.  These functions are intentionally granular so
they can be tested independently of the full `resolveModifiers()` logic.

```js
/**
 * Case A: food is in the stomach before the drink arrives.
 * True when: t_food ≤ t_drink ≤ t_food + post_window
 *
 * @param {number} drink_time_min
 * @param {number} food_time_min
 * @param {number} post_window_min
 * @returns {boolean}
 */
export function isCoveredCaseA(drink_time_min, food_time_min, post_window_min)

/**
 * Case B: drink was consumed before food but is still absorbing when food
 * arrives — so the food slows the ongoing absorption.
 * True when: t_drink < t_food  AND  (t_drink + T_base) ≥ t_food
 *
 * @param {number} drink_time_min
 * @param {number} food_time_min
 * @param {number} t_base_min  — unmodified fasted absorption time for the drink
 * @returns {boolean}
 */
export function isCoveredCaseB(drink_time_min, food_time_min, t_base_min)

/**
 * Given a list of food-parameter objects that all cover the same drink, return
 * the most protective one (lowest ethanol_factor; ties broken by lowest T_absorb).
 *
 * @param {Array<{ T_absorb: number, ethanol_factor: number, post_window: number }>} params
 * @returns {{ T_absorb: number, ethanol_factor: number, post_window: number }}
 */
export function selectBestCovering(params)
```

### 3.6 `model/presets.js` — Preset Library (Pure Layer)

Pure functions for managing the drink preset library.  No `localStorage` access.

```js
/** Validate a preset object; returns [] on success or error strings on failure. */
export function validatePreset(obj)

/**
 * Merge built-in presets with user overrides from localStorage.
 * Override with same id replaces built-in; { id, hidden:true } hides a built-in.
 * Custom-only overrides (new ids) are appended after built-ins.
 */
export function mergePresets(builtins, overrides)

/** Find a preset by id in a merged list.  Returns undefined if not found. */
export function findPresetById(presets, id)

/** Return a sorted copy (alphabetical by name) without mutating the original. */
export function sortPresets(presets)

/** Apply a single override to a merged list; appends if id is new. */
export function applyOverride(presets, override)

/** Convenience: build the visible list from DEFAULT_DRINK_PRESETS + overrides array. */
export function buildPresetList(overrides = [])
```

### 3.7 `model/bac.js` — Simulation Engine

The top-level orchestrator.  Calls `resolveModifiers()` for each drink,
then runs the 1-minute loop integrating absorption and M-M elimination.

```js
/**
 * Run the BAC simulation from t_start_min to t_end_min at 1-minute resolution.
 *
 * Algorithm (per minute t):
 *   ΔBAC_abs  = Σ_drinks  ethanolG(d) × factor_d × ΔfractionAbsorbed_d(t) / (W×1000×r) × 100
 *   β_eff     = BETA_MAX × BAC[t−1] / (BAC[t−1] + KM)
 *   ΔBAC_elim = β_eff / 60
 *   BAC[t]    = max(0, BAC[t−1] + ΔBAC_abs − ΔBAC_elim)
 *
 * @param {Array<{time_min:number, volume_ml:number, abv_pct:number,
 *                carbonated:boolean, with_food:boolean}>} drinks
 * @param {Array<{time_min:number, type:string}>} food_events
 * @param {{ sex:string, weight_kg:number, height_cm:number, age:number }} profile
 * @param {number} t_start_min
 * @param {number} t_end_min
 * @returns {Array<{ t_min: number, bac_pct: number }>}
 */
export function bacSeries(drinks, food_events, profile, t_start_min, t_end_min)

/**
 * Return the first time (minutes) in the series where BAC falls below
 * SOBER_THRESHOLD, or null if BAC never rises above the threshold.
 * @param {Array<{ t_min: number, bac_pct: number }>} series
 * @returns {number|null} t_min of sober time, or null
 */
export function findSoberTime(series)

/**
 * Compute the lower and upper uncertainty bounds for a single BAC value,
 * clamped to ≥ 0.
 * lower = max(0, bac_pct × (1 − UNCERTAINTY_CV))
 * upper = bac_pct × (1 + UNCERTAINTY_CV)
 * @param {number} bac_pct
 * @returns {{ lower: number, upper: number }}
 */
export function uncertaintyBounds(bac_pct)
```

---

## 4. Persistence Layer (`store/`)

### 4.1 `store/presets.js`

localStorage adapter for the drink preset library.  Key: `alculator_preset_overrides`.
Delegates all pure logic (merging, validation) to `model/presets.js`.

```js
export function loadPresets()         // merge DEFAULT_DRINK_PRESETS with overrides
export function savePreset(preset)    // validate then upsert override; throws on error
export function deletePreset(id)      // hide built-in or remove custom
export function resetPresets()        // clear all overrides → factory defaults
```

Override format stored in localStorage:
- Full or partial preset: `{ id, name?, volume_ml?, abv_pct?, carbonated?, duration_min? }`
- Hidden built-in:        `{ id, hidden: true }`

### 4.2 `store/session.js`

Manages the current session in `localStorage` under the key `alculator_session`.

```js
// localStorage schema (JSON):
// {
//   "schema": "alculator-session-v2",
//   "saved_at": "<ISO timestamp>",
//   "profile": { sex, weight_kg, height_cm, age },
//   "drinks": [ { id, name, volume_ml, abv_pct, logged_at, carbonated, with_food } ],
//   "food_events": [ { id, meal_size, note, logged_at } ]
// }

export function saveSession(session)    // Serialise and write to localStorage
export function loadSession()           // Read and parse; returns null if absent
export function clearSession()          // Delete the key from localStorage
```

**Recalculation trigger:** Any mutation (add/edit/delete drink or food event)
calls `saveSession()` and then dispatches a custom DOM event `alculator:session-changed`.
The UI layer listens for this event and re-runs `bacSeries()` to redraw the chart.

The model layer is never called from `session.js` — session.js only stores
and retrieves raw data objects.  The UI layer is responsible for calling
`bacSeries()` with the current session state.

### 4.3 Session vs. Profile Persistence

The user profile is stored as part of the session object but is preserved
separately: a "Clear session" action clears drinks and food events but keeps
the profile so the user does not need to re-enter their weight/height after
each night out.  Import of a session file replaces drinks and food events but
not the profile (unless the user explicitly confirms, per FR-95).

---

## 5. I/O Layer (`io/`)

### 5.1 `io/session_io.js`

Pure functions for serialisation; no `localStorage` access — that belongs
in `store/session.js`.

```js
/**
 * Serialise session data to a JSON string conforming to the export schema.
 * @param {{ profile, drinks, food_events }} session
 * @returns {string} JSON string
 */
export function exportJSON(session)

/**
 * Parse and validate a JSON string; return a session object on success.
 * Throws a descriptive Error on validation failure (wrong schema version,
 * missing required fields, unknown meal_size values, etc.).
 * @param {string} json
 * @returns {{ profile, drinks, food_events }}
 */
export function importJSON(json)

/**
 * Validate a parsed session object against the schema.
 * Returns an array of human-readable error strings (empty = valid).
 * @param {unknown} obj
 * @returns {string[]}
 */
export function validateSchema(obj)
```

**Schema versioning:** The `"schema"` field in exported JSON must equal
`"alculator-session-v2"`.  `importJSON()` rejects files with any other schema
version with a clear error message.  When the schema changes (e.g. a new field
is added), increment the version string and add a migration path in `importJSON()`.

---

## 6. Test Structure

### 6.1 Unit Tests — File Map

Each unit test file is a 1-to-1 map to one model module.  Tests import only
from the module under test and from `model/constants.js` (for computing expected
values).  They do not import from `ui/`, `store/`, or each other.

| Test file | Module(s) under test | §6.1 group | # cases | Status |
|-----------|----------------------|------------|---------|--------|
| `tests/unit/profile.test.js` | `model/profile.js` | Seidl r (6), Watson TBW (2) | 8 | pending |
| `tests/unit/ethanol.test.js` | `model/absorption.js` | Ethanol dose (3) | 3 | ✓ in absorption.test.js |
| `tests/unit/absorption.test.js` | `model/absorption.js` | Absorption model (8), food flag (2), duration (8), resolveModifiers (14) | 36 | ✓ passing |
| `tests/unit/elimination.test.js` | `model/elimination.js` | M-M kinetics (4) | 4 | pending |
| `tests/unit/food.test.js` | `model/food.js` | Case A/B (11), selectBestCovering (5) | 17 | ✓ passing |
| `tests/unit/presets.test.js` | `model/presets.js` | Preset library (23) | 23 | ✓ passing |
| `tests/unit/bac.test.js` | `model/bac.js` | BAC curve (5), uncertainty (2) | 7 | pending |
| `tests/unit/io.test.js` | `io/session_io.js` | Export/Import (4) | 4 | pending |
| **Unit subtotal** | | | **99** | 76 passing |

### 6.2 Integration / Scenario Tests

`tests/integration/scenarios.test.js` imports `bacSeries()` and runs it with
the exact inputs from `scripts/generate_curves.py`.  The expected peak BAC
values are taken from the Python script's output and are hardcoded as the
ground truth for the JavaScript implementation.

| Scenario | Drinks | Food | Expected peak BAC | Tolerance |
|----------|--------|------|-------------------|-----------|
| Ex 1: 3 wines, fasted | 3 × wine, 19:00/20:00/21:00 | none | 0.0524 % | ±0.001 % |
| Ex 2: heavy meal 30 min before | same + heavy meal 18:30 | heavy_meal | 0.0378 % | ±0.001 % |
| Ex 3: drink 1 h before meal, not covered | wine 19:00, meal 20:00; 2 wines after | full_meal | 0.0387 % | ±0.001 % |
| Ex 4: drink 30 min before meal, Case B | wine 19:30, meal 20:00; 2 wines after | full_meal | 0.0422 % | ±0.001 % |
| Ex 5: snack mid-session | 3 wines + snack 19:30 | snack | 0.0521 % | ±0.001 % |
| Ex 6: champagne + dinner | 3 champagnes + full meal | full_meal | 0.0397 % | ±0.001 % |

These tests are the **permanent regression suite**.  If a future code change
shifts any peak by more than ±0.001 %, the test fails and the developer must
confirm the change is intentional before updating the expected value.

### 6.3 Running Tests

```bash
# Run all tests once (for CI)
npm test

# Watch mode during development
npm run test:watch

# Generate coverage report
npm run coverage
# Coverage report written to coverage/index.html
```

Coverage targets (enforced by `vitest.config.js`):

- **100 % function coverage** of `model/*.js` and `io/session_io.js`
- **100 % branch coverage** of the same files
- `model/constants.js` is excluded (it is data, not logic)

### 6.4 Test-Writing Conventions

**Derive expected values from constants, not from magic numbers:**
```js
// Good — stays correct if FOOD_PARAMS.full_meal.ethanol_factor changes
import * as C from '../../model/constants.js';
import { ethanolG } from '../../model/absorption.js';
const effective = ethanolG(150, 12) * C.FOOD_PARAMS.full_meal.ethanol_factor;
expect(effective).toBeCloseTo(13.08, 2);

// Bad — breaks silently if ethanol_factor is updated
expect(effective).toBeCloseTo(13.08, 2);  // where does 13.08 come from?
```

Exception: the 6 scenario peak BAC values in `scenarios.test.js` are
deliberately hardcoded because they validate JS against the Python reference.

**One logical assertion per test case** — if a case has a "setup" and a
"result", a single `it()` block with one `expect()` is ideal.

**Test names match §6.1 table descriptions verbatim** so it is trivial to
cross-reference a failing test with the requirements document.

---

## 7. Constants Update Workflow

This is the procedure for updating a pharmacokinetic parameter when new
research becomes available.  Following it keeps constants, requirements,
research notes, and tests in sync.

### Step-by-step

1. **Edit `model/constants.js`**
   - Change the numeric value.
   - Update the `@see` field to the new citation.
   - Update the `@update` field if the conditions for future updates have changed.
   - If the constant is a table (e.g. `FOOD_PARAMS`), update only the affected row(s).

2. **Run `npm test`**
   - Failing unit tests identify every function whose behaviour changed.
   - Failing scenario tests identify which reference curves are now different.

3. **For each failing test:**
   - Verify the new expected value is physiologically correct (cross-check with
     `scripts/generate_curves.py` if it is a scenario test).
   - Update the expected value in the test file.
   - Do *not* disable or delete the test.

4. **Update `REQUIREMENTS.md`**
   - Update the relevant formula or parameter table in §4.3 or §4.8.2.
   - Add an entry to the changelog table.

5. **Update `RESEARCH.md` §10** if the citation is new or the range changed.

6. **Commit** all changed files together in a single commit with a message like:
   ```
   Update BETA_MAX from 0.015 to 0.014 %/h (Smith et al. 2026)
   ```

### Worked Example: Updating β_max

Suppose a 2027 meta-analysis of 50 studies finds that the population mean
β_max is 0.014 %/h rather than 0.015 %/h.

```diff
// model/constants.js

-  * @see RESEARCH.md §3.1, §10 (Holford 1987; range 0.010–0.020 in population)
+  * @see RESEARCH.md §3.1, §10 (Smith 2027 meta-analysis; range 0.010–0.020)
-export const BETA_MAX = 0.015;
+export const BETA_MAX = 0.014;
```

Running `npm test` shows:
- `elimination.test.js` — `betaEff` at BAC = 0.08 % now returns a different value → update expected
- `bac.test.js` — "BAC at t=45 min" is now slightly lower → update expected
- `scenarios.test.js` — all 6 peak BAC values shift by ~7 % → update all 6 expected values

Then update `REQUIREMENTS.md §4.3.3`:
```diff
-  BETA_MAX = 0.015    # %/h (Holford 1987)
+  BETA_MAX = 0.014    # %/h (Smith 2027)
```

And add to the REQUIREMENTS.md changelog:

| Change | Reason |
|--------|--------|
| BETA_MAX reduced from 0.015 to 0.014 %/h (§4.3.3) | Smith 2027 meta-analysis of 50 studies finds lower population mean |

---

## 8. Reference Implementation

### 8.1 Role of `scripts/generate_curves.py`

The Python script in `scripts/generate_curves.py` is the **canonical
reference implementation** of the BAC model.  It was the first complete,
correct implementation of the Michaelis-Menten elimination model with
Case A/B food coverage, and its outputs have been verified against the
pharmacokinetics literature.

Its primary purposes are:

1. **Generate the SVG curve images** embedded in `ABSORPTION_MODEL.md`
2. **Provide expected values** for the 6 integration scenario tests
3. **Serve as a cross-check** when the JavaScript implementation produces
   unexpected results

### 8.2 Policy: The Script is Read-Only

The Python script must not be modified as part of routine development.
It is a documentation artefact.  If the pharmacokinetic model itself changes
(e.g. β_max is updated), the script is updated together with `model/constants.js`
so that the SVG images and expected values remain consistent — but this is a
deliberate, documented model change, not a routine code edit.

### 8.3 How Scenario Test Values Were Derived

The expected peak BAC values in `tests/integration/scenarios.test.js` were
obtained by running:

```bash
python3 scripts/generate_curves.py
```

Output (used as expected values, ±0.001 % tolerance):

```
Ex 1 (fasted baseline):      peak = 0.0524 %
Ex 2 (heavy meal before):    peak = 0.0378 %
Ex 3 (drink 1h before food): peak = 0.0387 %
Ex 4 (drink 30m before, B):  peak = 0.0422 %
Ex 5 (snack mid-session):    peak = 0.0521 %
Ex 6 (champagne+dinner):     peak = 0.0397 %
```

If the JavaScript implementation produces values outside the ±0.001 %
tolerance, the most likely cause is an arithmetic difference in the
simulation loop (e.g. floating-point rounding in the per-minute absorption
increment).  The Python implementation should be treated as correct.
