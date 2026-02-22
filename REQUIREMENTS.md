# Alculator — Blood Alcohol Content Tracker
## Requirements Specification v2.1
*Date: 2026-02-22 | Supersedes v2.0*

---

## Changelog (v2.0 → v2.1)

| Change | Reason |
|--------|--------|
| Food log added as first-class session entity (§4.9) | A binary per-drink flag cannot capture when a meal was eaten or how substantial it was; dedicated food events allow time-windowed effects and curve markers |
| Meal size tiers (Snack / Light meal / Full meal / Heavy meal) | Food reduces peak BAC by 10–50 % depending on quantity and fat/protein content; a single modifier cannot represent this range |
| Food event time windows | Food eaten before drinking affects absorption differently from food eaten during or after; windows model the duration of the gastric-emptying delay |
| Food log events take precedence over per-drink food flag | Log events carry richer data; flag remains as a quick fallback when no log entry covers the drink |
| Food events shown as markers on BAC curve | Gives the user a visual record of the full evening (food + drinks) on a single timeline |
| Export/Import updated to include food_events array | Food events are part of session data and must survive a round-trip |
| Unit tests extended for food log, time windows, and precedence | Formula logic touching food is now more complex; tests must cover all branches |

## Changelog (v1.0 → v2.0)

| Change | Reason |
|--------|--------|
| Height added to user profile | Enables Seidl/Watson formulas; required for accurate *r* |
| BAC formula upgraded from fixed-*r* Widmark to Seidl + Watson | Research shows Seidl has clearly higher congruence with measured BAC than fixed Widmark |
| Absorption phase model added | Ignoring absorption produces an unphysical step-function BAC curve |
| Uncertainty band added as optional overlay | Gullberg (2015) establishes ±21% CV; users must understand the estimate is a range |
| BAC curve over time added as the central UI element | Replaces numeric-only display; gives temporal context for the whole evening |
| Food-with-drinks flag added | Food reduces peak BAC by 20–50%; research supports including this modifier |
| Carbonation flag on champagne preset | Ridout (2003) documents faster early absorption with carbonated drinks |
| Export / Import of session data | Allows sharing, backup, and post-hoc review |
| Unit testing requirements added | Ensures the formula implementation remains correct |
| Disclaimer updated with uncertainty figure | Accuracy claim must be honest |

---

## 1. Overview

Alculator is a mobile-first, client-side web application that estimates a user's
Blood Alcohol Content (BAC) in real time. It runs entirely in the browser, is
hosted on GitHub Pages, and stores all data locally in the browser so no account
or internet connection is needed after the initial load.

The **central UI element** is a BAC-over-time curve showing the complete arc of an
evening: from the first drink to the estimated sober time. An optional uncertainty
band visually communicates that the curve is an estimate, not a measurement.

---

## 2. Goals

| ID | Goal |
|----|------|
| G-1 | Help users make informed decisions about alcohol consumption at social events |
| G-2 | Require no installation, registration, or internet connectivity after first load |
| G-3 | Be fast and usable one-handed on a phone screen |
| G-4 | Be medically-informed but clearly disclaim it is an estimate, not medical advice |
| G-5 | Use the most accurate practical BAC formula (Seidl, with Watson as cross-check) |
| G-6 | Communicate uncertainty honestly so users do not over-trust the number |

---

## 3. Users

**Primary user:** An adult at a party or social event who wants to track their
own alcohol intake and get a rough BAC estimate. They are using a smartphone,
likely in low-light conditions, and may have already had some drinks.

**Secondary user:** A host, designated driver organiser, or harm-reduction
worker who wants to help someone assess their state at the end of a night.

**Assumptions:**
- The user is of legal drinking age in their jurisdiction
- The user understands that BAC estimates are approximations only
- The user has a modern mobile browser (Chrome/Firefox/Safari, ~2022+)

---

## 4. Functional Requirements

### 4.1 User Profile

| ID | Requirement |
|----|-------------|
| FR-01 | The app shall collect **biological sex** (male / female) for BAC calculation |
| FR-02 | The app shall collect **body weight** in kg or lbs (user's choice), convertible on the fly |
| FR-03 | The app shall collect **age** in whole years |
| FR-04 | The app shall collect **height** in cm or ft+in (user's choice), convertible on the fly |
| FR-05 | Profile data shall be persisted in localStorage and pre-filled on subsequent visits |
| FR-06 | The user shall be able to edit the profile at any time |
| FR-07 | The app shall not allow BAC calculation until a valid profile exists (all four fields) |
| FR-08 | Age < 18 shall display a notice that the app is intended for adults only and shall not proceed |

**Why height?** The Seidl formula requires height to calculate an individualised *r*
factor. Without height the app falls back to Widmark fixed-*r* values, which carry a
larger systematic error for non-average body types.

### 4.2 Drink Entry

| ID | Requirement |
|----|-------------|
| FR-10 | The app shall provide a catalog of **preset drinks** covering common categories |
| FR-11 | Preset drinks shall include at minimum: standard beer, strong beer, wine, champagne, shot/spirit, cocktail |
| FR-12 | Each preset shall have a default volume (mL) and ABV (%) |
| FR-13 | The user shall be able to adjust the volume and ABV of any drink before logging it |
| FR-14 | A **custom drink** option shall allow free entry of name, volume, and ABV |
| FR-15 | The timestamp of a drink shall default to "now" but be editable by the user (±6 hours) |
| FR-16 | One tap / click shall be sufficient to log a preset drink with default values |
| FR-17 | Each drink log entry shall carry a **carbonated** flag (defaults: champagne = true, all others = false) |
| FR-18 | The user shall be able to mark a drink entry as **consumed with food** (quick fallback when no food log entry covers the drink; see §4.9) |
| FR-19 | A global **"eating alongside drinks"** toggle shall apply the food modifier to all newly logged drinks that are not already covered by a food log event |

**Preset drink reference values:**

| Drink | Default volume | Default ABV | Carbonated |
|-------|---------------|-------------|------------|
| Beer (regular) | 330 mL | 5 % | no |
| Beer (strong) | 330 mL | 8 % | no |
| Wine | 150 mL | 12 % | no |
| Champagne / Prosecco | 125 mL | 12 % | **yes** |
| Shot / Spirit | 40 mL | 40 % | no |
| Cocktail | 200 mL | 10 % | no |
| Custom | user-defined | user-defined | user choice |

### 4.3 BAC Calculation

#### 4.3.1 Formula Selection — Seidl (primary) + Widmark (fallback)

| ID | Requirement |
|----|-------------|
| FR-20 | BAC shall be calculated using the **Seidl formula** for the individualised *r* factor when height is provided |
| FR-21 | When height is not available (profile incomplete), the app shall fall back to the **fixed Widmark *r*** values |
| FR-22 | The Watson TBW formula shall be computed silently as a cross-check and may be exposed in a detail view |
| FR-23 | BAC shall be recalculated continuously (at least every 60 seconds) |
| FR-24 | BAC shall be clamped to a minimum of 0.00 % |
| FR-25 | The app shall display a **"sober by"** estimated time (when BAC reaches 0.00 %) |
| FR-26 | BAC values shall be shown to two decimal places (e.g. 0.08 %) |

**Seidl *r* formulas** (reference: Seidl et al., *Int J Legal Med*, 2000):

```
r_male   = 0.32 − (0.0048 × weight_kg) + (0.0046 × height_cm)
r_female = 0.31 − (0.0064 × weight_kg) + (0.0045 × height_cm)
```

**Widmark fallback *r*** (reference: Widmark, 1932):

```
r_male   = 0.68
r_female = 0.55
```

**Watson TBW** (reference: Watson et al., *Am J Clin Nutr*, 1980):

```
TBW_male   (L) = 2.447 − (0.09516 × age_yr) + (0.1074 × height_cm) + (0.3362 × weight_kg)
TBW_female (L) = −2.097 + (0.1069 × height_cm) + (0.2466 × weight_kg)
r_watson       = TBW / (weight_kg × 0.80)
```

#### 4.3.2 Absorption Phase Model

The Widmark formula in its classical form treats all alcohol as instantly present
in the bloodstream. This produces a step-function BAC profile that is physically
inaccurate and gives a misleading curve. The app shall use a simplified linear
absorption ramp for each drink.

| ID | Requirement |
|----|-------------|
| FR-27 | Each drink's ethanol contribution shall be modelled as absorbed linearly from `t_drink` to `t_drink + T_absorb` |
| FR-28 | The default absorption window `T_absorb` shall be **45 minutes** |
| FR-29 | Carbonated drinks shall use `T_absorb = 20 minutes` as the base (faster gastric emptying; Ridout 2003) |
| FR-30 | The food modifier applied to a drink shall be resolved in priority order: (1) the most protective food log event whose time window covers the drink (§4.8), (2) the per-drink "with food" flag (FR-18), (3) no food modifier |
| FR-31 | When a food log event covers a drink, `T_absorb_i = food_event.T_absorb` (food effect dominates; carbonation flag is disregarded because the gastric-slowing effect of food supersedes CO₂ acceleration) |
| FR-32 | When only the per-drink food flag applies (no covering food log event), `T_absorb_i = 90 min` for non-carbonated drinks and `T_absorb_i = 45 min` for carbonated drinks (opposing effects partially cancel) |
| FR-33 | The absorbed fraction at time *t* for drink *i* is: `f_i(t) = clamp((t − t_i) / T_absorb_i, 0, 1)` |

**Food modifier on effective ethanol dose:**
Food increases first-pass metabolism (more time in contact with gastric ADH) and
dilutes stomach contents, reducing the fraction of ethanol that reaches the blood.
Each food source contributes an ethanol reduction factor on top of the T_absorb
extension. The resolution order mirrors FR-30:

| Food source | `ethanol_factor_i` |
|---|---|
| No food | 1.00 (no reduction) |
| Per-drink food flag only | 0.85 (15 % reduction) |
| Food log — Snack | 0.90 (10 % reduction) |
| Food log — Light meal | 0.80 (20 % reduction) |
| Food log — Full meal | 0.65 (35 % reduction) |
| Food log — Heavy meal | 0.50 (50 % reduction) |

If multiple food log events cover the same drink, the one with the **lowest**
`ethanol_factor_i` (most protective) shall apply.

#### 4.3.3 Elimination

| ID | Requirement |
|----|-------------|
| FR-34 | Elimination shall follow **zero-order kinetics**: BAC declines at a constant rate while BAC > 0 |
| FR-35 | Default elimination rate β = **0.015 % per hour** |
| FR-36 | Elimination shall begin from the time of the **first drink** (absorption and elimination run concurrently) |
| FR-37 | BAC = max(0, Σ(ethanol_g_i × ethanol_factor_i × f_i(t)) / (weight_kg × 1000 × r) × 100 − β × hours_since_first_drink) |

**Full formula (informative):**

```
For each drink i at time t_i with volume V_i (mL) and ABV_i:
  ethanol_g_i       = V_i × ABV_i/100 × 0.789         (ethanol density 0.789 g/mL)

  Resolve food modifier (priority: food log event > per-drink flag > none):
    covering_events   = food_events where (t_j − pre_j) ≤ t_i ≤ (t_j + post_j)
    if covering_events:
      best            = event in covering_events with lowest ethanol_factor
      ethanol_factor_i = best.ethanol_factor
      T_absorb_i      = best.T_absorb          (food dominates; carbonation ignored)
    elif drink.with_food:
      ethanol_factor_i = 0.85
      T_absorb_i      = 45 min if carbonated else 90 min
    else:
      ethanol_factor_i = 1.00
      T_absorb_i      = 20 min if carbonated else 45 min

  f_i(t)            = clamp((t − t_i) / T_absorb_i, 0, 1)
  absorbed_g_i(t)   = ethanol_g_i × ethanol_factor_i × f_i(t)

r = Seidl r (or Widmark fallback)

BAC(t) = max(0,
    Σ absorbed_g_i(t) / (weight_kg × 1000 × r) × 100
    − β × (t − t_first) / 3600
)
```

*(All times in seconds internally; hours used in the formula above for legibility.)*

#### 4.3.4 Uncertainty

The Widmark-family of formulas has a documented **±21 % coefficient of variation**
(Gullberg, 2015). This uncertainty arises from inter-individual variability in *r*
and β that no simple formula can capture. The app shall surface this honestly.

| ID | Requirement |
|----|-------------|
| FR-38 | The app shall compute a **lower bound** = BAC × (1 − 0.21) and **upper bound** = BAC × (1 + 0.21) |
| FR-39 | The main numeric display shall optionally show the range as "0.08 % (0.06–0.10 %)" |
| FR-40 | The BAC curve shall support an **uncertainty band overlay** (see §4.5) |
| FR-41 | The uncertainty bounds shall be clamped to ≥ 0.00 % |

### 4.4 BAC Display

| ID | Requirement |
|----|-------------|
| FR-42 | The current BAC value shall be prominently displayed on the main screen |
| FR-43 | A colour-coded safety indicator shall accompany the BAC value |
| FR-44 | Safety colour thresholds (informational, not legal): |

| BAC range | Colour | Label |
|-----------|--------|-------|
| 0.00 % | Green | Sober |
| 0.01 – 0.05 % | Yellow | Light buzz |
| 0.06 – 0.08 % | Orange | Tipsy |
| 0.09 – 0.15 % | Red | Drunk |
| > 0.15 % | Dark red | Heavily intoxicated |

| FR-45 | The estimated "sober by" time shall update in real time |
| FR-46 | A per-drink contribution (grams of alcohol, and estimated BAC contribution at peak) shall be shown in the log |
| FR-47 | If the upper uncertainty bound exceeds 0.08 %, a caution note shall be shown even if the central estimate is below 0.08 % |

### 4.5 BAC Curve (Central Feature)

The BAC curve is the primary visual element of the application. It shows the
computed BAC trajectory from the first drink through the present moment and
forward to the estimated sober time.

| ID | Requirement |
|----|-------------|
| FR-50 | The app shall display an SVG or Canvas line chart of BAC versus clock time |
| FR-51 | The X axis shall span from the earliest of (first drink, first food event) to the later of: (current time + 1 h) or (estimated sober time + 30 min) |
| FR-52 | The Y axis shall span from 0.00 % to max(BAC_peak × 1.3, 0.10 %) |
| FR-53 | The curve shall include a vertical line (or contrasting marker) at **current time** |
| FR-54 | Reference horizontal lines shall be drawn at 0.05 % and 0.08 % with labels |
| FR-55 | Each logged drink shall be marked on the time axis with a distinct drink icon or tick |
| FR-56 | Each logged food event shall be marked on the time axis with a distinct food icon (e.g. fork/knife), labelled with the meal size |
| FR-57 | The curve shall update at minimum every 60 seconds; a manual "refresh" button shall also be available |
| FR-58 | The **uncertainty band** shall be toggleable on/off via a clearly labelled switch |
| FR-59 | When enabled, the uncertainty band shall be rendered as a filled, semi-transparent area bounded by BAC × 0.79 (lower) and BAC × 1.21 (upper), clamped to ≥ 0 |
| FR-60 | The curve area before the current-time marker shall be rendered with full opacity; the area after (forecast) shall be rendered at reduced opacity to distinguish measured past from projected future |
| FR-61 | The chart shall be readable on a 375 px wide screen without horizontal scroll |
| FR-62 | Tapping a point on the curve shall display a tooltip with the BAC value and clock time at that point |
| FR-63 | The curve shall be re-rendered whenever a drink or food event is added, edited, or deleted |

### 4.6 Combined Session Log

The session log shows drinks and food events interleaved in reverse-chronological
order, giving a complete picture of the evening on a single scrollable list.

| ID | Requirement |
|----|-------------|
| FR-70 | All drinks and food events logged in the current session shall be shown interleaved in reverse-chronological order |
| FR-71 | Each drink entry shall show: drink name, volume, ABV, time logged, alcohol (g), active food modifier (if any), carbonated flag |
| FR-72 | Each food entry shall show: meal size label, time logged, and the time window during which it affects drinks |
| FR-73 | The user shall be able to **delete** any individual drink or food entry |
| FR-74 | Deleting any entry shall immediately update the BAC curve and numeric display |
| FR-75 | A **Clear session** action shall remove all drinks and food events from the current session (requires confirmation) |
| FR-76 | The log shall survive a browser refresh (localStorage) |
| FR-77 | The user shall be able to **edit** a logged drink's timestamp, volume, or ABV after logging |
| FR-78 | The user shall be able to **edit** a logged food event's timestamp or meal size after logging |

### 4.7 Session Management

| ID | Requirement |
|----|-------------|
| FR-80 | A "session" is the list of drinks accumulated since the last clear |
| FR-81 | The session shall be stored in localStorage |
| FR-82 | The app shall offer to auto-clear sessions older than **24 hours** on next open |
| FR-83 | The user shall be able to manually start a new session at any time |

### 4.8 Food Log

Food is logged as a dedicated session entity — separate from and independent of
individual drinks. A food log entry records when the user ate and how substantial
the meal was. The app uses this to compute time-windowed absorption modifiers for
nearby drinks.

#### 4.8.1 Food Entry

| ID | Requirement |
|----|-------------|
| FR-100 | The app shall provide a **+ Add food** action accessible from the main screen |
| FR-101 | The user shall select a **meal size** from four options: Snack, Light meal, Full meal, Heavy meal |
| FR-102 | The user shall optionally enter a free-text note (e.g. "pizza", "salad") for their own reference; this note has no effect on the calculation |
| FR-103 | The timestamp of a food event shall default to "now" but be editable by the user (±6 hours) |
| FR-104 | One tap on a meal-size button shall be sufficient to log a food event at the current time with no further input required |

#### 4.8.2 Meal Size Parameters

The parameters below are derived from the pharmacokinetics literature (gastric
emptying studies, Frezza 1990, research in RESEARCH.md §1.3). T_absorb is the
absorption window applied to covered drinks. ethanol_factor is the multiplier
applied to effective ethanol dose. pre_window and post_window define the time
span around the food event during which drinks are considered "covered".

| Meal size | Representative examples | T_absorb | ethanol_factor | pre_window | post_window |
|-----------|------------------------|----------|----------------|------------|-------------|
| **Snack** | Bread roll, crisps, nuts, small appetiser | 60 min | 0.90 (−10 %) | 30 min | 60 min |
| **Light meal** | Salad, soup, small plate, 1–2 appetisers | 75 min | 0.80 (−20 %) | 60 min | 90 min |
| **Full meal** | Main course with moderate fat and protein | 90 min | 0.65 (−35 %) | 90 min | 150 min |
| **Heavy meal** | Large high-fat/protein meal (burger, steak, pizza, pasta) | 120 min | 0.50 (−50 %) | 120 min | 180 min |

**Coverage rule:** A drink at `t_drink` is covered by a food event at `t_food` when:

```
t_food − pre_window  ≤  t_drink  ≤  t_food + post_window
```

**Multiple covering events:** If two or more food events cover the same drink,
the event with the lowest `ethanol_factor` (most protective) is applied for both
`ethanol_factor` and `T_absorb`.

**Precedence:** A food log event takes precedence over the per-drink food flag.
If no food log event covers a drink, the per-drink flag applies (FR-30).

#### 4.8.3 Food Log Management

| ID | Requirement |
|----|-------------|
| FR-105 | Food events shall appear in the combined session log alongside drinks, ordered by timestamp |
| FR-106 | The user shall be able to delete any food event; the BAC curve shall update immediately |
| FR-107 | The user shall be able to edit a food event's meal size or timestamp; the BAC curve shall update immediately |
| FR-108 | The food log shall survive a browser refresh (stored in localStorage with the drink log) |
| FR-109 | When a food event is added, edited, or deleted, the app shall recalculate which drinks are covered and update their effective T_absorb and ethanol_factor values before re-rendering the curve |

#### 4.8.4 Visual Representation

| ID | Requirement |
|----|-------------|
| FR-110 | Each food event shall be displayed as a distinct icon on the BAC curve time axis (e.g. fork/knife symbol), visually differentiated from drink markers |
| FR-111 | The icon shall be labelled with the meal size abbreviation (S / L / F / H) |
| FR-112 | Tapping a food event marker on the curve shall display a tooltip showing meal size, timestamp, and the number of drinks affected |

### 4.9 Export and Import

| ID | Requirement |
|----|-------------|
| FR-90 | The app shall provide an **Export session** action that downloads a JSON file |
| FR-91 | The exported JSON shall include: schema version, export timestamp, user profile snapshot (weight, height, sex, age — no PII beyond what the user entered), the full drink log, and the full food event log |
| FR-92 | The exported file shall be named `alculator-session-YYYYMMDD-HHMMSS.json` |
| FR-93 | The app shall provide an **Import session** action that reads a previously exported JSON file |
| FR-94 | On import, the app shall validate the JSON schema before applying it |
| FR-95 | A valid import shall replace the current session's drink log; the user profile shall **not** be replaced unless the user explicitly confirms |
| FR-96 | An invalid or unrecognised file shall show a clear error message and make no changes |
| FR-97 | Import and Export actions shall be accessible from the session menu |

**Export JSON schema (informative):**

```json
{
  "schema": "alculator-session-v2",
  "exported_at": "2026-02-22T21:00:00Z",
  "profile": {
    "sex": "male",
    "weight_kg": 80,
    "height_cm": 180,
    "age": 32
  },
  "drinks": [
    {
      "id": "uuid-v4",
      "name": "Beer (regular)",
      "volume_ml": 330,
      "abv_pct": 5.0,
      "logged_at": "2026-02-22T19:30:00Z",
      "carbonated": false,
      "with_food": false
    }
  ],
  "food_events": [
    {
      "id": "uuid-v4",
      "meal_size": "full_meal",
      "note": "pasta",
      "logged_at": "2026-02-22T19:00:00Z"
    }
  ]
}
```

Valid `meal_size` values: `"snack"`, `"light_meal"`, `"full_meal"`, `"heavy_meal"`.

---

## 5. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | **Mobile-first**: all interactive targets ≥ 44 × 44 px (WCAG 2.5.5) |
| NFR-02 | **Performance**: app fully usable within 2 s on a 3G connection (assets < 150 KB including chart library) |
| NFR-03 | **Offline capable**: after first load, the app shall function with no internet |
| NFR-04 | **No external data**: zero API calls; no data ever leaves the device |
| NFR-05 | **Browser support**: latest two major versions of Chrome, Firefox, and Safari Mobile |
| NFR-06 | **Accessibility**: sufficient colour contrast (WCAG AA), no colour-only information, chart has text alternative |
| NFR-07 | **Installable**: a Web App Manifest shall allow "Add to Home Screen" on iOS/Android |
| NFR-08 | **Dark mode**: the app shall respect the device's `prefers-color-scheme` media query |

---

## 6. Unit Testing Requirements

| ID | Requirement |
|----|-------------|
| UT-01 | A unit test suite shall be provided covering all BAC calculation logic |
| UT-02 | Tests shall be runnable with a single command (e.g. `npm test`) without a browser |
| UT-03 | The test framework shall be **Vitest** (or Jest if Vitest is unavailable) |
| UT-04 | Test coverage shall include the cases listed in §6.1 |
| UT-05 | Tests shall be co-located with source files or in a `__tests__` / `tests` directory |
| UT-06 | All tests shall pass before any commit is merged |
| UT-07 | The CI configuration (GitHub Actions) shall run tests on every push to the branch |

### 6.1 Required Test Cases

#### Seidl *r* computation

| Test | Input | Expected |
|------|-------|----------|
| Male average | weight=80 kg, height=180 cm | r ≈ 0.644 |
| Female average | weight=65 kg, height=165 cm | r ≈ 0.527 |
| Widmark fallback (male) | no height | r = 0.68 |
| Widmark fallback (female) | no height | r = 0.55 |
| Watson TBW male | age=30, height=175 cm, weight=75 kg | TBW ≈ 41.8 L |
| Watson TBW female | age=30, height=165 cm, weight=62 kg | TBW ≈ 30.6 L |

#### Ethanol dose calculation

| Test | Input | Expected |
|------|-------|----------|
| Standard beer | 330 mL × 5 % | ≈ 13.01 g ethanol |
| Shot | 40 mL × 40 % | ≈ 12.62 g ethanol |
| Custom | 200 mL × 6.5 % | ≈ 10.26 g ethanol |

#### Absorption model

| Test | Scenario | Expected |
|------|----------|----------|
| Default drink at t=0, checked at t=22.5 min | f = 0.5 (half absorbed) |
| Default drink at t=0, checked at t=45 min | f = 1.0 (fully absorbed) |
| Default drink at t=0, checked at t=90 min | f = 1.0 (clamped at 1) |
| Carbonated drink, checked at t=10 min | f = 0.5 (T_absorb=20 min) |
| Food drink, checked at t=45 min | f = 0.5 (T_absorb=90 min) |
| Both flags set, checked at t=22.5 min | f = 0.5 (T_absorb=45 min) |

#### BAC curve values

| Test | Scenario | Expected BAC |
|------|----------|-------------|
| Zero drinks | any time | 0.00 % |
| One beer (standard male profile) at t=0, checked at t=0 | 0.00 % (not yet absorbed) |
| One beer (standard male profile) at t=0, checked at t=45 min | > 0.00 % and < 0.10 % |
| BAC never goes below 0 | any scenario with heavy elimination | ≥ 0.00 % |
| "Sober time" is after all BAC reaches 0 | standard scenario | estimated time > t_first_drink |

#### Per-drink food flag (fallback)

| Test | Scenario | Expected |
|------|----------|----------|
| Same drink with and without food flag | food flag set, no covering food event | effective ethanol = 85 % of non-food value |
| Food flag + carbonated | both set, no covering food event | T_absorb = 45 min; ethanol_factor = 0.85 |

#### Food log — coverage window

| Test | Scenario | Expected |
|------|----------|----------|
| Full meal at 19:00; drink at 18:30 | drink is 30 min before meal (within 90 min pre_window) | drink is covered |
| Full meal at 19:00; drink at 17:29 | drink is 91 min before meal (outside 90 min pre_window) | drink is NOT covered |
| Full meal at 19:00; drink at 21:30 | drink is 150 min after meal (within 150 min post_window) | drink is covered |
| Full meal at 19:00; drink at 21:31 | drink is 151 min after meal (outside 150 min post_window) | drink is NOT covered |
| Snack at 20:00; drink at 20:59 | drink is 59 min after snack (within 60 min post_window) | drink is covered |

#### Food log — parameter application

| Test | Scenario | Expected T_absorb | Expected ethanol_factor |
|------|----------|-------------------|------------------------|
| Snack covers drink (non-carbonated) | snack event | 60 min | 0.90 |
| Light meal covers drink (non-carbonated) | light meal event | 75 min | 0.80 |
| Full meal covers drink (non-carbonated) | full meal event | 90 min | 0.65 |
| Heavy meal covers drink (non-carbonated) | heavy meal event | 120 min | 0.50 |
| Full meal covers carbonated drink | full meal + carbonated | 90 min (food dominates) | 0.65 |

#### Food log — precedence and multiple events

| Test | Scenario | Expected |
|------|----------|----------|
| Food log covers drink; drink also has food flag | food log event is present | food log parameters apply; per-drink flag ignored |
| Two food events cover same drink (full + heavy meal) | overlapping coverage | heavy meal parameters apply (most protective) |
| No food log covers drink; no food flag | fasted drinking | ethanol_factor = 1.00; T_absorb = 45 min (or 20 if carbonated) |

#### Uncertainty bounds

| Test | Input BAC | Expected lower | Expected upper |
|------|-----------|---------------|---------------|
| Nominal | 0.08 % | 0.0632 % | 0.0968 % |
| Zero | 0.00 % | 0.00 % | 0.00 % |

#### Export / Import round-trip

| Test | Action | Expected |
|------|--------|----------|
| Export then re-import | export session with drinks and food events, parse JSON, import | drink log and food event log identical to original |
| Food events affect reimported drinks | import session where food event covers a drink | covered drink uses food log parameters, not per-drink flag |
| Invalid JSON | import malformed file | error message, no state change |
| Wrong schema version | import v0 or v1 file | error message, no state change |

---

## 7. Constraints

- Hosted on **GitHub Pages** — static files only, no server-side logic
- All persistence via **localStorage** (cookies explicitly excluded due to 4 KB limit)
- The charting library (if used) shall be MIT-licensed and CDN-importable without a build step;
  alternatively, a plain SVG implementation is acceptable
- Must work without a service worker (service worker is an enhancement, not a requirement)

---

## 8. Out of Scope

- Multi-user support
- Drink history across multiple sessions beyond the 24 h auto-clear
- Integration with wearables or external sensors
- Legal BAC limits by country / jurisdiction (displayed limits are general reference only)
- Push notifications
- Genetic variation adjustments (ADH1B, ALDH2) — documented in RESEARCH.md, not feasible as user inputs
- Medication interaction warnings (out of scope; users should consult a pharmacist)

---

## 9. Disclaimer (must appear in-app)

> BAC estimates are based on the Seidl/Widmark formula and carry an inherent
> **±21 % uncertainty** (Gullberg, 2015). Individual metabolism varies significantly
> based on genetics, medications, food, and health status.
> **Do not drive or make any safety-critical decision based on this app.**
> If in any doubt, do not drive.

---

## 10. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-01 | Given a valid profile (all four fields) and logged drinks, BAC displayed matches manual Seidl calculation ± 0.005 % |
| AC-02 | A drink logged at T=0 shows 50 % of its BAC contribution after 22.5 minutes (default T_absorb = 45 min) |
| AC-03 | A drink fully absorbed at T=45 min, checked at T=2 h, shows correct elimination-reduced BAC |
| AC-04 | Refreshing the browser restores the profile and full drink log unchanged |
| AC-05 | The app is usable on an iPhone SE (375 px wide) without horizontal scroll |
| AC-06 | The "Add drink" flow requires no more than 2 taps for a preset drink at default values |
| AC-07 | The disclaimer is visible on the main screen without scrolling |
| AC-08 | The BAC curve is visible on the main screen without scrolling on a 375 px wide device |
| AC-09 | Toggling the uncertainty band on/off updates the chart within 200 ms |
| AC-10 | Export produces a valid JSON file; importing that file on a fresh session restores the drink log and food event log exactly |
| AC-11 | All unit tests pass (`npm test` exits 0) |
| AC-12 | Deleting a drink or food event immediately updates the BAC curve |
| AC-13 | A food event logged at T=0 (full meal) reduces the effective ethanol dose of a drink logged at T=0 to 65 % of its fasted value |
| AC-14 | A drink outside all food event windows falls back to per-drink flag or fasted parameters correctly |
| AC-15 | Food event markers are visible on the BAC curve time axis at their logged timestamps |
