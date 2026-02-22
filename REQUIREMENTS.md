# Alculator — Blood Alcohol Content Tracker
## Requirements Specification v1.0
*Date: 2026-02-22*

---

## 1. Overview

Alculator is a mobile-first, client-side web application that estimates a user's
Blood Alcohol Content (BAC) in real time. It runs entirely in the browser, is
hosted on GitHub Pages, and stores all data locally in the browser so no account
or internet connection is needed after the initial load.

---

## 2. Goals

| ID | Goal |
|----|------|
| G-1 | Help users make informed decisions about alcohol consumption at social events |
| G-2 | Require no installation, registration, or internet connectivity after first load |
| G-3 | Be fast and usable one-handed on a phone screen |
| G-4 | Be medically-informed but clearly disclaim it is an estimate, not medical advice |

---

## 3. Users

**Primary user:** An adult at a party or social event who wants to track their
own alcohol intake and get a rough BAC estimate. They are using a smartphone,
likely in low-light conditions, and may have already had some drinks.

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
| FR-03 | The app shall collect **age** in years |
| FR-04 | Profile data shall be persisted in localStorage and pre-filled on subsequent visits |
| FR-05 | The user shall be able to edit the profile at any time |
| FR-06 | The app shall not allow BAC calculation until a valid profile exists |
| FR-07 | Age < 18 shall display a notice that the app is intended for adults only |

### 4.2 Drink Entry

| ID | Requirement |
|----|-------------|
| FR-10 | The app shall provide a catalog of **preset drinks** covering common categories |
| FR-11 | Preset drinks shall include at minimum: standard beer, strong beer, wine, champagne, shot/spirit, cocktail |
| FR-12 | Each preset shall have a default volume (mL) and ABV (%) |
| FR-13 | The user shall be able to adjust the volume and ABV of any drink before logging it |
| FR-14 | A **custom drink** option shall allow free entry of name, volume, and ABV |
| FR-15 | The timestamp of a drink shall default to "now" but be editable by the user |
| FR-16 | One tap / click shall be sufficient to log a preset drink with default values |

**Preset drink reference values:**

| Drink | Default volume | Default ABV |
|-------|---------------|-------------|
| Beer (regular) | 330 mL | 5 % |
| Beer (strong) | 330 mL | 8 % |
| Wine | 150 mL | 12 % |
| Champagne | 125 mL | 12 % |
| Shot / Spirit | 40 mL | 40 % |
| Cocktail | 200 mL | 10 % |
| Custom | user-defined | user-defined |

### 4.3 BAC Calculation

| ID | Requirement |
|----|-------------|
| FR-20 | BAC shall be calculated using the **Widmark formula** |
| FR-21 | Body water constant `r`: 0.68 for male, 0.55 for female |
| FR-22 | Metabolism rate: **0.015 % per hour** (standard clinical approximation) |
| FR-23 | BAC shall be recalculated continuously (at least every 60 seconds) |
| FR-24 | BAC shall be clamped to a minimum of 0.00 % |
| FR-25 | The app shall display a **"sober by"** estimated time (when BAC reaches 0) |
| FR-26 | BAC values shall be shown to two decimal places (e.g. 0.08 %) |

**Formula reference:**

```
alcohol_g  = volume_mL × ABV × 0.789          (ethanol density)
BAC (%)    = Σ(alcohol_g) / (weight_g × r) − (0.015 × hours_since_first_drink)
```

### 4.4 BAC Display

| ID | Requirement |
|----|-------------|
| FR-30 | The current BAC value shall be prominently displayed on the main screen |
| FR-31 | A colour-coded safety indicator shall accompany the BAC value |
| FR-32 | Safety levels (common reference, not legal advice): |

| BAC range | Colour | Label |
|-----------|--------|-------|
| 0.00 % | Green | Sober |
| 0.01 – 0.05 % | Yellow | Light buzz |
| 0.06 – 0.08 % | Orange | Tipsy |
| 0.09 – 0.15 % | Red | Drunk |
| > 0.15 % | Dark red | Heavily intoxicated |

| FR-33 | The estimated "sober by" time shall update in real time |
| FR-34 | A per-drink contribution (grams of alcohol) shall be shown in the log |

### 4.5 Drink Log

| ID | Requirement |
|----|-------------|
| FR-40 | All drinks logged in the current session shall be shown in reverse-chronological order |
| FR-41 | Each log entry shall show: drink name, volume, ABV, time logged |
| FR-42 | The user shall be able to **delete** any individual log entry |
| FR-43 | A **Clear session** action shall remove all drinks from the current session |
| FR-44 | The log shall survive a browser refresh (localStorage) |

### 4.6 Session Management

| ID | Requirement |
|----|-------------|
| FR-50 | A "session" is the list of drinks accumulated since the last clear |
| FR-51 | The session shall be stored in localStorage |
| FR-52 | The app shall offer to auto-clear sessions older than **24 hours** on next open |
| FR-53 | The user shall be able to manually start a new session at any time |

---

## 5. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | **Mobile-first**: all interactive targets ≥ 44 × 44 px (WCAG 2.5.5) |
| NFR-02 | **Performance**: app fully usable within 2 s on a 3G connection (assets < 100 KB) |
| NFR-03 | **Offline capable**: after first load, the app shall function with no internet |
| NFR-04 | **No external data**: zero API calls; no data ever leaves the device |
| NFR-05 | **Browser support**: latest two major versions of Chrome, Firefox, and Safari Mobile |
| NFR-06 | **Accessibility**: sufficient colour contrast (WCAG AA), no colour-only information |
| NFR-07 | **Installable**: a Web App Manifest shall allow "Add to Home Screen" on iOS/Android |

---

## 6. Constraints

- Hosted on **GitHub Pages** — static files only, no server-side logic
- All persistence via **localStorage** (cookies explicitly excluded due to 4 KB limit)
- No external JavaScript frameworks requiring a build step (CDN imports are acceptable)
- Must work without a service worker (service worker is an enhancement, not a requirement)

---

## 7. Out of Scope

- Multi-user support
- Drink history across multiple days / sessions beyond the 24 h auto-clear
- Integration with wearables or external sensors
- Legal BAC limits by country / jurisdiction (displayed limits are general reference only)
- Push notifications ("your BAC has dropped to X")

---

## 8. Disclaimer (must appear in-app)

> BAC estimates are based on the Widmark formula and are approximations only.
> Individual metabolism varies significantly. **Do not drive or make safety-critical
> decisions based on this app.** If in doubt, do not drive.

---

## 9. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-01 | Given a valid profile and logged drinks, BAC displayed matches manual Widmark calculation ± 0.005 % |
| AC-02 | A drink logged at T=0 shows the correct reduced BAC at T=1 h without user interaction |
| AC-03 | Refreshing the browser restores the profile and full drink log |
| AC-04 | The app is usable on an iPhone SE (375 px wide) without horizontal scroll |
| AC-05 | The "Add drink" flow requires no more than 2 taps for a preset drink at default values |
| AC-06 | The disclaimer is visible on the main screen without scrolling |
