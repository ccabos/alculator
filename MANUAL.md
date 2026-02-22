# Alculator — User Manual
## Version 1.1 | Draft
*Date: 2026-02-22*

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Important Safety Disclaimer](#2-important-safety-disclaimer)
3. [Getting Started](#3-getting-started)
4. [Setting Up Your Profile](#4-setting-up-your-profile)
5. [Logging Drinks](#5-logging-drinks)
6. [The BAC Curve](#6-the-bac-curve)
7. [The Uncertainty Band](#7-the-uncertainty-band)
8. [The BAC Readout](#8-the-bac-readout)
9. [The Session Log](#9-the-session-log)
10. [Logging Food](#10-logging-food)
11. [Exporting and Importing Data](#11-exporting-and-importing-data)
12. [Starting a New Session](#12-starting-a-new-session)
13. [Installing the App on Your Phone](#13-installing-the-app-on-your-phone)
14. [Understanding the Science](#14-understanding-the-science)
15. [Frequently Asked Questions](#15-frequently-asked-questions)

---

## 1. Introduction

**Alculator** is a free, private, browser-based tool that estimates your Blood
Alcohol Content (BAC) throughout an evening. It tracks the drinks you log,
models how alcohol is absorbed and eliminated by your body, and draws a
real-time BAC curve so you can see the full arc of your evening at a glance.

**What Alculator is:**
- A harm-reduction tool to help you make more informed decisions
- An educational tool to visualise how BAC changes over time
- A personal tracker that stores nothing outside your own device

**What Alculator is not:**
- A breathalyser or a medical device
- Legal or medical advice
- A substitute for your own judgement

---

## 2. Important Safety Disclaimer

> **BAC estimates carry an inherent uncertainty of approximately ±21 %.**
> A reading of 0.080 % could reflect a true BAC anywhere from 0.063 % to 0.097 %.
>
> Alculator uses the scientifically validated Seidl/Widmark formula, but individual
> metabolism varies due to genetics, medications, food, hydration, and health status
> in ways no formula can fully capture.
>
> **Never drive or make any safety-critical decision based on this app.**
> If you are in any doubt about your fitness to drive, do not drive.

---

## 3. Getting Started

Alculator runs entirely in your web browser. No app to install, no account to
create, no data transmitted to any server.

1. Open the Alculator URL in your browser.
2. On first use, you will be prompted to **set up your profile** (§4).
3. Once your profile is saved, you can start logging drinks immediately.
4. The **BAC curve** updates automatically as you add drinks and time passes.

Your profile and drink log are saved in your browser's local storage. They will
still be there if you close and reopen the tab — as long as you use the same
browser on the same device and do not clear your browsing data.

---

## 4. Setting Up Your Profile

Alculator needs four pieces of information to calculate your BAC accurately.
Tap the **profile icon** (top-right corner) or the "Set up profile" prompt on
first launch.

### Fields

| Field | Why it matters |
|-------|----------------|
| **Biological sex** (male / female) | Women have a smaller body-water fraction and lower first-pass alcohol metabolism, producing higher BAC for the same dose. |
| **Body weight** (kg or lbs) | The main denominator in the BAC formula — heavier people dilute alcohol across more body mass. |
| **Height** (cm or ft/in) | Combined with weight and sex, height lets Alculator calculate your personal distribution factor (*r*) via the Seidl formula. Without height the app falls back to a population average, which is less accurate. |
| **Age** (years) | Older adults have less body water per kilogram, raising BAC relative to younger adults of the same weight. |

### Tips

- You can switch between metric (kg/cm) and imperial (lbs/ft+in) at any time;
  the values convert automatically.
- You can update your profile at any time. The change takes effect immediately
  and the BAC curve recalculates.
- Your profile data never leaves your device.

---

## 5. Logging Drinks

### Adding a preset drink

1. Tap the **+ Add drink** button.
2. Tap the drink type you had (e.g. "Beer (regular)").
3. The drink is logged instantly with default volume and ABV.
   - **That's it — two taps.**

### Adjusting volume or ABV

If your beer was 500 mL instead of 330 mL, or a stronger 6.5 %:

1. Tap **+ Add drink**.
2. Tap the drink type.
3. Tap **Edit** before confirming, or long-press the preset to open the detail view.
4. Adjust the volume and/or ABV sliders.
5. Tap **Log drink**.

### Custom drinks

For anything not in the preset list:

1. Tap **+ Add drink** → **Custom**.
2. Enter a name, the volume in mL, and the ABV in %.
3. Tap **Log drink**.

### Adjusting the time

If you had a drink 20 minutes ago and forgot to log it:

1. Tap **+ Add drink**, choose the drink.
2. Tap the **time stamp** field (shows "now" by default).
3. Adjust to the actual time you drank it.
4. Tap **Log drink**.

The BAC curve will immediately reflect the corrected time.

---

## 6. The BAC Curve

The BAC curve is the heart of Alculator. It is a line chart displayed prominently
on the main screen showing your estimated BAC from your first drink of the evening
through to the moment you are projected to be fully sober.

### Reading the chart

```
BAC (%)
0.10 |          ___
0.08 |........./...\_______  ← 0.08 % reference line
0.05 |........|.............\___  ← 0.05 % reference line
0.00 |________|___________________|____________> time
             ↑                    ↑
          first drink          sober by
                       ↑
                   NOW (vertical marker)
```

- **Solid curve (past):** Your BAC history from the first drink to right now,
  based on what you have logged.
- **Dashed curve (forecast):** Your projected BAC from now until you reach 0.00 %,
  assuming no more drinks.
- **Vertical "NOW" line:** The current moment. Everything to the left is history;
  everything to the right is projection.
- **Drink markers:** Small ticks on the time axis show when each drink was logged.
- **Reference lines:** Dashed horizontal lines at 0.05 % and 0.08 % help you
  compare your estimated BAC to common legal driving limits.

### The curve shape

Unlike a simple "add a drink, BAC jumps up" model, Alculator models the
**absorption phase**: alcohol is not instantly in your bloodstream the moment you
drink it. For a typical drink, it takes about 45 minutes to be fully absorbed.
This gives the curve a smooth rise rather than a sudden step.

Carbonated drinks (champagne, prosecco, sparkling cocktails) are absorbed faster —
the CO₂ accelerates gastric emptying. Food slows absorption significantly.
Both of these effects are visible on the curve.

### Interacting with the chart

- **Tap (or hover) anywhere on the curve** to see a tooltip with the BAC value
  and the clock time at that point.
- **Toggle the uncertainty band** with the switch labelled "Show uncertainty".
  See §7.

---

## 7. The Uncertainty Band

### What is it?

Tap **"Show uncertainty"** to reveal a shaded band around the BAC curve.
The band represents the realistic range of what your true BAC might be,
given the inherent limitations of any formula-based estimate.

### Why ±21 %?

The Widmark/Seidl formula is the gold standard for BAC estimation, used in
forensic and clinical contexts worldwide. However, even with height, weight, age,
and sex as inputs, the formula has a documented **coefficient of variation of
approximately ±21 %** (Gullberg, 2015). This arises from:

- Variation in individual body-water distribution not captured by simple
  anthropometrics
- Variation in individual elimination rates (β ranges from 0.010 to 0.035 %/h
  across the population; the formula assumes 0.015 %/h)
- Genetics (ADH and ALDH2 enzyme variants affect metabolism speed)
- Effects of medications, health status, and hydration

### What the band means in practice

| Displayed BAC | Lower bound | Upper bound |
|---------------|-------------|-------------|
| 0.050 % | 0.040 % | 0.061 % |
| 0.080 % | 0.063 % | 0.097 % |
| 0.100 % | 0.079 % | 0.121 % |

If the **upper bound exceeds 0.08 %**, Alculator will show a caution note even
if the central estimate is below 0.08 %. This matters if you are considering
driving — your true BAC may be higher than displayed.

### Turning it on / off

The uncertainty band adds visual complexity. It is off by default. Turn it on
when you want to understand the range rather than just the single estimate.
Your preference is remembered between sessions.

---

## 8. The BAC Readout

### Main display

The top of the screen shows:

```
 0.06 %        ← estimated current BAC (central value)
 (0.05–0.07)   ← uncertainty range (shown when band is enabled)
 Tipsy         ← colour-coded label
 Sober by 00:45 ← estimated sober time
```

### Colour labels

| BAC | Colour | Label |
|-----|--------|-------|
| 0.00 % | Green | Sober |
| 0.01–0.05 % | Yellow | Light buzz |
| 0.06–0.08 % | Orange | Tipsy |
| 0.09–0.15 % | Red | Drunk |
| > 0.15 % | Dark red | Heavily intoxicated |

These labels are a rough reference. They are **not medical diagnoses** and
should not be used to judge fitness for any activity.

### Sober-by time

The "sober by" time is the projected clock time at which your BAC reaches 0.00 %,
assuming you drink nothing more. It updates in real time as time passes.

If the uncertainty band is enabled, Alculator also shows the **latest possible**
sober time (based on the upper bound BAC) so you have a conservative estimate
of when you might be safe to drive.

---

## 9. The Session Log

Scroll down on the main screen (or tap the **"Log"** tab) to see every drink
and food event you have logged this session, interleaved in reverse-chronological
order. This gives you a single complete timeline of the evening at a glance.

### Drink entries show

- **Drink name** and type
- **Volume** (mL) and **ABV** (%)
- **Alcohol content** in grams
- **Time logged**
- Carbonation flag (if set)
- **Active food modifier** — which food event (if any) is affecting this drink's
  absorption, and the resulting effective ethanol reduction (e.g. "Full meal −35 %")

### Food entries show

- **Meal size** label (Snack / Light meal / Full meal / Heavy meal)
- **Time logged**
- **Coverage window** — the span of time during which this food event affects
  nearby drinks (e.g. "covers drinks from 17:30 to 21:30")
- Your optional **note** (e.g. "pizza")

### Editing an entry

Tap any log entry to open it. For a drink you can change the timestamp, volume,
ABV, or carbonation flag. For a food event you can change the timestamp or meal
size. Changes take effect immediately and the BAC curve recalculates.

### Deleting an entry

Swipe left on any log entry (or long-press and tap Delete) to remove it.
The BAC curve updates instantly — including any change in food coverage for
nearby drinks.

### Clearing the session

Tap the **menu** (top-right) → **Clear session** to remove all drinks and food
events and start fresh. You will be asked to confirm before anything is deleted.

---

## 10. Logging Food

Food has a substantial, well-documented effect on alcohol absorption. Eating
before or during drinking can reduce your peak BAC by 10–50 % and delay it
by 30–120 minutes. Alculator lets you log food as a first-class event so the
BAC curve reflects your actual evening, not just the drinks.

### Why food matters (the science in brief)

When food is in your stomach — particularly fat and protein — it:

1. **Slows gastric emptying.** Alcohol stays in the stomach longer, where it
   is absorbed more slowly (~20 % of absorption) rather than passing quickly
   to the small intestine (where ~80 % of absorption happens).
2. **Dilutes alcohol concentration** in stomach contents, reducing the
   absorption gradient.
3. **Extends contact time with gastric enzymes** (gastric ADH), which break
   down a fraction of alcohol before it ever reaches the bloodstream.

The combined effect means that a large, high-fat/protein meal consumed before
or during drinking can reduce peak BAC by approximately 50 % compared with
drinking fasted.

### Logging a food event

1. Tap the **+ Add food** button (or the fork icon on the main screen).
2. Choose a **meal size**:

   | Meal size | What counts | Peak BAC effect |
   |-----------|-------------|-----------------|
   | **Snack** | Bread roll, crisps, nuts, small appetiser | −10 % |
   | **Light meal** | Salad, soup, 1–2 small plates | −20 % |
   | **Full meal** | Standard main course (moderate fat/protein) | −35 % |
   | **Heavy meal** | Large meal, high fat/protein (burger, steak, pizza, pasta) | −50 % |

3. The timestamp defaults to **now**. Tap it to adjust if you ate earlier.
4. Optionally add a short **note** (e.g. "pizza", "bar snacks") for your own
   reference. Notes do not affect the calculation.
5. Tap **Log food**.

That's all. Alculator automatically works out which drinks are within the food
event's coverage window and adjusts their absorption parameters.

### How food events affect nearby drinks

Each meal size defines a **coverage window** — the span of time before and after
the meal during which drinks are considered "with food":

| Meal size | Covers drinks up to ... before | Covers drinks up to ... after |
|-----------|-------------------------------|-------------------------------|
| Snack | 30 min before | 1 h after |
| Light meal | 1 h before | 1.5 h after |
| Full meal | 1.5 h before | 2.5 h after |
| Heavy meal | 2 h before | 3 h after |

Any drink whose timestamp falls within this window receives:
- A longer absorption window (slower rise on the BAC curve)
- A reduced effective ethanol dose (lower peak BAC contribution)

**Food eaten before drinking** is modelled because alcohol consumed shortly after
a meal is still affected — the food is still slowing gastric emptying.

If multiple food events overlap on the same drink, the most protective one
(the highest meal size) is used.

### Food markers on the BAC curve

Each food event appears as a **fork icon** on the time axis of the BAC curve,
labelled with the meal size abbreviation (S / L / F / H). Tapping the icon
shows a tooltip with the meal size, time, and number of drinks affected.

You can see the difference a meal makes by logging a food event and watching
the BAC curve flatten and shift right in real time.

### The "Eating alongside drinks" quick toggle

For quick logging without creating a food event, you can tap the
**fork-and-knife icon** on the main screen to enable "Eating alongside drinks"
mode. While active, any newly logged drink that is not already covered by a food
log event will receive the basic per-drink food modifier: a 90-minute absorption
window and 15 % ethanol reduction. This is a rough approximation; for accuracy,
log a food event instead.

### Carbonation and food together

Carbonated drinks (champagne, prosecco) are absorbed faster because CO₂
accelerates gastric emptying. However, when food is present, the food-induced
slowing of gastric emptying dominates. Alculator therefore applies the food
event's T_absorb to carbonated drinks when a food event covers them, and
ignores the carbonation modifier. In practice, that flute of champagne at a
meal will behave like a non-carbonated drink for absorption purposes.

---

## 11. Exporting and Importing Data

### Why export?

- **Backup:** Keep a record of the evening in case you clear the session.
- **Review:** Open the JSON file later on a computer to see what you drank.
- **Sharing:** If you are with someone who also has Alculator, you can share
  a session (e.g. a group keeping track together — but note each person should
  use their own profile for their own BAC calculation).

### How to export

1. Tap the **menu** → **Export session**.
2. A JSON file named `alculator-session-YYYYMMDD-HHMMSS.json` is downloaded
   to your device.
3. The file contains: your profile snapshot, your full drink log, and your
   full food event log for the session.

### How to import

1. Tap the **menu** → **Import session**.
2. Select the Alculator JSON file from your device.
3. Alculator validates the file. If it is a valid Alculator export:
   - The drink log from the file **replaces** your current session's log.
   - Your profile is **not changed** unless you separately confirm replacing it
     with the profile snapshot from the file.
4. The BAC curve recalculates using your current profile and the imported drinks.

### What the file contains

The file is plain text JSON. You can open it in any text editor. It does not
contain your name, email address, location, or any other identifying information
beyond what you explicitly entered into your profile (weight, height, age, sex).

### Errors

| Error message | What it means |
|---|---|
| "Not a valid Alculator file" | The file is not JSON or does not have the expected structure. |
| "Unknown schema version" | The file was exported by a different (possibly older) version of Alculator. Try updating the app. |
| "Import cancelled — no changes made" | You chose to cancel during the confirmation step. Nothing was changed. |

---

## 12. Starting a New Session

A session is the drinks logged since you last cleared. Sessions auto-expire
after 24 hours — when you open Alculator more than 24 hours after the last
logged drink, it will ask if you want to start fresh.

To start a new session manually:

1. Tap the **menu** → **New session** (or **Clear session**).
2. Confirm the prompt.
3. All drinks are removed. Your profile is untouched.

Consider **exporting** your session (§11) before clearing if you want a record.

---

## 13. Installing the App on Your Phone

Alculator can be installed to your home screen for a native-app-like experience
with no browser chrome.

### iOS (Safari)

1. Open Alculator in Safari.
2. Tap the **Share** button (box with arrow, bottom of screen).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**.

### Android (Chrome)

1. Open Alculator in Chrome.
2. Tap the **three-dot menu** (top-right).
3. Tap **Add to Home screen**.
4. Tap **Add**.

Once installed, Alculator works fully offline after the first load.

---

## 14. Understanding the Science

This section explains the pharmacokinetics behind Alculator's calculations
at a level accessible to a non-specialist.

### How alcohol gets into your blood

After you drink, alcohol is absorbed through the walls of your stomach
(~20 %) and small intestine (~80 %). The speed depends on:

- **What you have eaten:** Food slows the passage of alcohol from the stomach
  to the intestine (where absorption is fastest). A meal can cut your peak BAC
  roughly in half compared to drinking on an empty stomach.
- **Carbonation:** CO₂ in sparkling drinks accelerates gastric emptying,
  getting more alcohol to the small intestine sooner. This causes a faster,
  steeper rise in BAC in the first 20–35 minutes — then the two curves
  (carbonated vs. still) converge.
- **Drink strength:** Very strong spirits (> 30 % ABV) actually irritate the
  stomach lining and slow absorption, which is why straight spirits can feel
  less intoxicating acutely than the same amount of alcohol mixed in a cocktail.

### The Widmark / Seidl formula

Your BAC is the concentration of alcohol in your blood. It is calculated as:

```
BAC = alcohol in your system / (your body water mass)
```

"Body water mass" is your weight multiplied by a factor *r* — the fraction of
your body that is water and therefore participates in diluting alcohol. Muscle
is ~75 % water; fat is only ~10 % water. This is why body composition matters,
not just weight.

Alculator uses the **Seidl formula** to estimate *r* from your height and weight:
it has been validated in controlled drinking experiments and consistently
outperforms the simpler approach of using a fixed male/female average.

### How alcohol leaves your blood

Your liver enzymes (primarily alcohol dehydrogenase, ADH) break down alcohol
at an approximately constant rate regardless of your BAC — this is called
**zero-order kinetics**. Unlike most drugs, your body processes about the same
number of grams of alcohol per hour whether your BAC is 0.05 % or 0.20 %.
There is no way to speed this up with coffee, water, food, or fresh air.

The typical elimination rate is **0.015 % BAC per hour** (the value Alculator
uses by default). The actual rate varies between individuals from 0.010 % to
0.035 % per hour — which is the primary reason the ±21 % uncertainty exists.

### Why the estimate is never exact

Even the best formula cannot account for:
- Your personal ADH/ALDH2 enzyme variants (genetic factors can change your
  elimination rate by 2–3×)
- Your current hydration state, health, and medications
- Whether your body composition is average for your height and weight
- How much of your drink was actually absorbed vs. lost to belching, vomiting,
  or the vagaries of gastric emptying speed on that particular night

This is why Alculator always shows an uncertainty range and never claims to
know your exact BAC. The number is a useful estimate — treat it as one.

---

## 15. Frequently Asked Questions

**Q: My BAC is showing 0.00 % right after I added a drink. Is this a bug?**

No. Alculator models the absorption phase: alcohol is not instantly in your
bloodstream. For a typical drink, the BAC curve rises gradually over 45 minutes.
Right after logging a drink, little of it has been absorbed yet. Check back in
20–30 minutes.

---

**Q: I feel more drunk than the number shows. Who's right?**

You are. BAC estimates carry ±21 % uncertainty, and subjective impairment can
be influenced by many factors the formula does not see: fatigue, medications,
stress, whether you have eaten, how quickly you drank. Trust how you feel, not
the number.

---

**Q: I feel less drunk than the number shows. Does that mean I am OK to drive?**

No. Pharmacodynamic tolerance — where experienced drinkers feel less impaired
at a given BAC — does not reduce actual driving impairment or crash risk. A
regular drinker who "handles alcohol well" is just as impaired at 0.08 % as
someone who feels very drunk at 0.08 %. If the number is elevated, your
driving ability is likely impaired regardless of how you feel.

---

**Q: Can I use the app for someone else (e.g. my partner)?**

You can temporarily change the profile to their measurements, but be aware:
(a) it overwrites your profile, and (b) you would need to re-enter their drinks
from memory. A better approach: have them open Alculator on their own phone in
their own browser.

---

**Q: The "sober by" time seems too early / too late.**

The sober-by time uses the default elimination rate of 0.015 %/h. If you
typically process alcohol faster (you feel sober sooner than the app predicts)
or slower (the app says you are sober but you still feel it), this reflects
normal individual variation. The true population range is 0.010–0.035 %/h.
There is currently no way to personalise the elimination rate in Alculator;
it is a future enhancement.

---

**Q: Why does champagne make me feel drunk faster?**

Because it is carbonated. CO₂ accelerates gastric emptying, pushing alcohol
into your small intestine (where absorption is much faster) sooner. This is
a real, documented pharmacological effect (Ridout et al., 2003). Alculator
models it with a faster absorption window for carbonated drinks.

---

**Q: I ate before I started drinking. Does that help and how do I log it?**

Yes, eating before drinking substantially reduces peak BAC. Log a food event
(§10) with the appropriate meal size and set the timestamp to when you ate.
Alculator will apply the food effect to drinks logged after the meal — and even
to drinks logged up to the pre-window of the meal (e.g. a drink 90 minutes before
a full meal is still affected because the food was in your stomach when your body
was processing that drink).

---

**Q: I had a snack earlier but didn't log it. Can I add it retroactively?**

Yes. Tap **+ Add food**, choose Snack, and tap the timestamp to adjust it to
when you actually ate. Alculator recalculates immediately once you save it.

---

**Q: I chose "Full meal" but I only had a light snack. Will this mess up my numbers?**

Yes — choosing too large a meal size will make the app underestimate your BAC.
Choose the meal size that best matches what you actually ate. When in doubt,
choose a smaller meal size; it is safer to err on the side of a higher BAC
estimate than a lower one.

---

**Q: Does eating during or after drinking help?**

Eating **during** drinking is nearly as effective as eating before — food in
your stomach slows absorption of alcohol that is already there. Alculator models
this correctly using the post-window of each food event.

Eating **after** significant drinking has little effect on BAC because most of
the alcohol has already been absorbed. The app models this by defining a
post-window that ends well before the estimated sober time.

---

**Q: Does drinking water or coffee help me sober up?**

No. Water and coffee do not speed up alcohol metabolism. Drinking water helps
prevent dehydration (which worsens hangover symptoms) but does not lower BAC
or reduce impairment. Coffee may make you feel more alert while remaining just
as impaired — potentially a more dangerous state for driving.

---

**Q: Why does the app ask for height? Other BAC calculators only ask for weight.**

Height allows Alculator to estimate your personal body-water distribution factor
(*r*) using the Seidl formula, which is more accurate than the simple population
averages used by calculators that only ask for weight and sex. Without height,
the error in the *r* estimate is larger, particularly for tall/lean or short/heavier
people where the population average is a poor approximation.

---

**Q: Is my data private?**

Yes. Alculator stores everything in your browser's localStorage only. No data is
transmitted to any server at any time. The app makes no network requests after
initial load. Your profile and drink log are on your device and only your device.

---

**Q: The BAC curve disappeared / the session was empty when I reopened the app.**

If your session was more than 24 hours old, Alculator will have asked whether to
clear it (and may have auto-cleared it). Also check that you opened the app in the
same browser you used before — localStorage is not shared between Chrome and Safari
on the same phone, for example. If you exported the session before closing, you can
reimport it (§11).

---

*Alculator Manual v1.1 — for feedback or bug reports, see the project repository.*
