"""
generate_curves.py
Generates SVG BAC curve images for ABSORPTION_MODEL.md.
Pure Python standard library — no external dependencies.

Profile used throughout:
  Male, 70 kg, 175 cm, age 30
  r (Seidl) = 0.32 - 0.0048*70 + 0.0046*175 = 0.789
  β_max = 0.015 %/h   (maximum elimination rate)
  Km    = 0.015 %      (ADH half-saturation constant)

Standard drink in most examples: wine 150 mL, 12 % ABV
  ethanol = 150 * 0.12 * 0.789 = 14.202 g
  fasted peak contribution = 14.202 / (70000 * 0.789) * 100 = 0.02572 %

Elimination model: Michaelis-Menten kinetics
  β_eff(BAC) = β_max × BAC / (BAC + Km)
  At high BAC (≫ Km), β_eff → β_max  (effectively zero-order)
  At low  BAC (≪ Km), β_eff → β_max × BAC / Km  (first-order-like)
  This matches RESEARCH.md §3.1 on ADH saturation kinetics.
"""

import os

# ── Profile ────────────────────────────────────────────────────────────────────
WEIGHT_KG = 70
HEIGHT_CM = 175
R_SEIDL   = 0.32 - 0.0048 * WEIGHT_KG + 0.0046 * HEIGHT_CM   # 0.789
BETA_MAX  = 0.015          # % BAC per hour, maximum elimination rate
KM        = 0.015          # % BAC, Michaelis-Menten half-saturation constant

ETHANOL_DENSITY = 0.789     # g / mL

# ── Food parameters (corrected model) ─────────────────────────────────────────
# ethanol_factor represents ONLY the incremental first-pass metabolism (FPM)
# from extended gastric residence time with food. The 20-50 % peak BAC
# reduction documented in the literature comes primarily from the slower
# absorption (extended T_absorb) allowing concurrent M-M elimination to
# remove more alcohol — not from dose reduction.
#
# Frezza 1990: fasted gastric FPM ≈ 5-10 %; food adds ~3-12 % extra FPM.
FOOD_PARAMS = {
    "snack":      {"T_absorb": 60,  "ethanol_factor": 0.97, "post_window": 60},
    "light_meal": {"T_absorb": 75,  "ethanol_factor": 0.95, "post_window": 90},
    "full_meal":  {"T_absorb": 90,  "ethanol_factor": 0.92, "post_window": 150},
    "heavy_meal": {"T_absorb": 120, "ethanol_factor": 0.90, "post_window": 180},
}

# ── Formula helpers ────────────────────────────────────────────────────────────

def ethanol_g(volume_ml, abv_pct):
    return volume_ml * (abv_pct / 100.0) * ETHANOL_DENSITY


def t_base(carbonated):
    """Unmodified base absorption time (minutes) before applying food."""
    return 20 if carbonated else 45


def resolve_modifiers(drink_time_min, carbonated, food_events, with_food_flag=False):
    """
    Return (T_absorb_min, ethanol_factor) for a drink.

    Coverage rule (physics-based):
      Case A — food in stomach BEFORE drink arrives:
          t_food <= t_drink  AND  t_drink <= t_food + post_window
      Case B — food arrives WHILE drink absorption is still ongoing:
          t_drink < t_food  AND  (t_drink + T_base) >= t_food

    If multiple events cover the drink, the most protective (lowest ethanol_factor)
    wins for both ethanol_factor and T_absorb.
    """
    tb = t_base(carbonated)
    covering = []
    for fe in food_events:
        t_food  = fe["time_min"]
        params  = FOOD_PARAMS[fe["type"]]
        pw      = params["post_window"]
        case_a  = t_food <= drink_time_min <= t_food + pw
        case_b  = (drink_time_min < t_food) and (drink_time_min + tb >= t_food)
        if case_a or case_b:
            covering.append(params)

    if covering:
        best = min(covering, key=lambda p: p["ethanol_factor"])
        return best["T_absorb"], best["ethanol_factor"]

    if with_food_flag:
        return (45 if carbonated else 90), 0.85

    return tb, 1.00


def bac_series(drinks, food_events, t_start_min, t_end_min):
    """
    Compute BAC at 1-minute intervals over [t_start_min, t_end_min]
    using incremental Michaelis-Menten elimination.

    drinks: list of dicts with keys: time_min, volume_ml, abv, carbonated, with_food
    food_events: list of dicts with keys: time_min, type
    Returns list of (t_min, bac_pct) tuples.

    Model:
      BAC[0] = 0
      For each minute t:
        ΔBAC_abs  = Σ (eth_g_i × factor_i × Δf_i) / (W×1000×r) × 100
        β_eff     = β_max × BAC[t-1] / (BAC[t-1] + Km)
        ΔBAC_elim = β_eff / 60  (convert per-hour to per-minute)
        BAC[t]    = max(0, BAC[t-1] + ΔBAC_abs − ΔBAC_elim)
    """
    if not drinks:
        return [(t, 0.0) for t in range(t_start_min, t_end_min + 1)]

    # Pre-compute modifiers for each drink
    precomputed = []
    for d in drinks:
        T_abs, factor = resolve_modifiers(
            d["time_min"], d.get("carbonated", False),
            food_events, d.get("with_food", False)
        )
        precomputed.append({**d, "T_absorb": T_abs, "ethanol_factor": factor,
                             "ethanol_g": ethanol_g(d["volume_ml"], d["abv"])})

    # Pre-compute the absorbed fraction f(t) at each minute for each drink,
    # so we can get Δf = f(t) - f(t-1) for the incremental step.
    def absorbed_fraction(drink, t):
        elapsed = t - drink["time_min"]
        if elapsed <= 0:
            return 0.0
        elif elapsed >= drink["T_absorb"]:
            return 1.0
        else:
            return elapsed / drink["T_absorb"]

    series = []
    bac_prev = 0.0

    for t in range(t_start_min, t_end_min + 1):
        # Absorption increment: sum of newly absorbed ethanol this minute
        delta_bac_abs = 0.0
        for d in precomputed:
            f_now  = absorbed_fraction(d, t)
            f_prev = absorbed_fraction(d, t - 1)
            delta_f = f_now - f_prev
            if delta_f > 0:
                absorbed_g = d["ethanol_g"] * d["ethanol_factor"] * delta_f
                delta_bac_abs += absorbed_g / (WEIGHT_KG * 1000.0 * R_SEIDL) * 100.0

        # Michaelis-Menten elimination for this minute
        if bac_prev > 0:
            beta_eff = BETA_MAX * bac_prev / (bac_prev + KM)  # %/h
            delta_bac_elim = beta_eff / 60.0                    # %/min
        else:
            delta_bac_elim = 0.0

        bac_now = max(0.0, bac_prev + delta_bac_abs - delta_bac_elim)
        series.append((t, bac_now))
        bac_prev = bac_now

    return series


def find_sober_time(series):
    """Return the last t where bac > 0.0005, plus a small margin."""
    last = None
    for t, bac in series:
        if bac > 0.0005:
            last = t
    return (last + 60) if last else series[-1][0]


# ── SVG generation ─────────────────────────────────────────────────────────────

def fmt_hhmm(minutes_from_midnight):
    h = int(minutes_from_midnight) // 60 % 24
    m = int(minutes_from_midnight) % 60
    return f"{h:02d}:{m:02d}"


def make_svg(series, drinks, food_events, title, filename, extra_series=None,
             extra_label=None, show_uncertainty=False):
    """
    series: list of (t_min, bac_pct) — main curve
    extra_series: optional second curve for comparison (different line style)
    extra_label: legend label for extra_series
    show_uncertainty: if True, draw ±21% band on main series
    """
    W, H = 760, 380
    ML, MR, MT, MB = 62, 30, 44, 64   # margins: left, right, top, bottom
    PW = W - ML - MR                   # plot width
    PH = H - MT - MB                   # plot height

    # Time range
    all_t = [t for t, _ in series]
    t_min_x = all_t[0]
    t_max_x = all_t[-1]
    t_span  = max(t_max_x - t_min_x, 1)

    # BAC range
    all_bac = [b for _, b in series]
    if extra_series:
        all_bac += [b for _, b in extra_series]
    if show_uncertainty:
        all_bac = [b * 1.21 for b in all_bac]
    bac_max = max(max(all_bac) * 1.25, 0.01)

    # Coordinate transforms
    def cx(t_min):
        return ML + (t_min - t_min_x) / t_span * PW

    def cy(bac):
        return MT + PH - (bac / bac_max) * PH

    # ── SVG parts ──
    parts = []

    # Background
    parts.append(
        f'<rect width="{W}" height="{H}" fill="#ffffff"/>'
        f'<rect x="{ML}" y="{MT}" width="{PW}" height="{PH}" fill="#f9fafb"/>'
    )

    # Determine y-axis grid step based on bac_max
    if bac_max <= 0.02:
        grid_step = 0.005
    elif bac_max <= 0.05:
        grid_step = 0.01
    else:
        grid_step = 0.02

    # Horizontal grid lines
    y_val = grid_step
    while y_val < bac_max:
        yy = cy(y_val)
        parts.append(
            f'<line x1="{ML}" y1="{yy:.1f}" x2="{ML+PW}" y2="{yy:.1f}" '
            f'stroke="#e5e7eb" stroke-width="1"/>'
        )
        y_val += grid_step

    # Vertical grid lines (every 30 min)
    t_tick = (t_min_x // 30 + 1) * 30
    while t_tick <= t_max_x:
        xx = cx(t_tick)
        parts.append(
            f'<line x1="{xx:.1f}" y1="{MT}" x2="{xx:.1f}" y2="{MT+PH}" '
            f'stroke="#e5e7eb" stroke-width="1"/>'
        )
        t_tick += 30

    # Reference lines at 0.05 % and 0.08 %
    for ref_bac, ref_col, ref_label in [
        (0.05, "#d97706", "0.05 %"),
        (0.08, "#dc2626", "0.08 %"),
    ]:
        if ref_bac < bac_max:
            yy = cy(ref_bac)
            parts.append(
                f'<line x1="{ML}" y1="{yy:.1f}" x2="{ML+PW}" y2="{yy:.1f}" '
                f'stroke="{ref_col}" stroke-width="1.2" stroke-dasharray="6,4"/>'
                f'<text x="{ML+PW+4}" y="{yy:.1f}" fill="{ref_col}" '
                f'font-size="10" dominant-baseline="middle">{ref_label}</text>'
            )

    # Uncertainty band on main curve
    if show_uncertainty:
        pts_upper = " ".join(
            f"{cx(t):.1f},{cy(min(b * 1.21, bac_max * 0.999)):.1f}"
            for t, b in series if b > 0
        )
        pts_lower = " ".join(
            f"{cx(t):.1f},{cy(b * 0.79):.1f}"
            for t, b in reversed(series) if b > 0
        )
        if pts_upper and pts_lower:
            parts.append(
                f'<polygon points="{pts_upper} {pts_lower}" '
                f'fill="#bfdbfe" fill-opacity="0.55" stroke="none"/>'
            )

    # Extra (comparison) curve — dashed gray
    if extra_series:
        pts = " ".join(
            f"{cx(t):.1f},{cy(b):.1f}" for t, b in extra_series
        )
        parts.append(
            f'<polyline points="{pts}" fill="none" stroke="#9ca3af" '
            f'stroke-width="2" stroke-dasharray="8,5"/>'
        )

    # Main BAC curve
    pts = " ".join(f"{cx(t):.1f},{cy(b):.1f}" for t, b in series)
    parts.append(
        f'<polyline points="{pts}" fill="none" stroke="#2563eb" stroke-width="2.5"/>'
    )

    # Zero baseline
    y0 = cy(0)
    parts.append(
        f'<line x1="{ML}" y1="{y0:.1f}" x2="{ML+PW}" y2="{y0:.1f}" '
        f'stroke="#6b7280" stroke-width="1"/>'
    )

    # Food event markers — green band + label above x axis
    for fe in food_events:
        xx   = cx(fe["time_min"])
        abbr = {"snack": "S", "light_meal": "L",
                "full_meal": "F", "heavy_meal": "H"}[fe["type"]]
        label = {"snack": "Snack", "light_meal": "Light meal",
                 "full_meal": "Full meal", "heavy_meal": "Heavy meal"}[fe["type"]]
        parts.append(
            f'<line x1="{xx:.1f}" y1="{MT}" x2="{xx:.1f}" y2="{MT+PH}" '
            f'stroke="#16a34a" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>'
            f'<rect x="{xx-12:.1f}" y="{MT+PH+6:.1f}" width="24" height="16" '
            f'rx="3" fill="#16a34a"/>'
            f'<text x="{xx:.1f}" y="{MT+PH+17:.1f}" fill="white" '
            f'font-size="10" font-weight="bold" text-anchor="middle">{abbr}</text>'
            f'<text x="{xx:.1f}" y="{MT-6:.1f}" fill="#16a34a" '
            f'font-size="9" text-anchor="middle">{label}</text>'
        )

    # Drink markers — blue tick + label below x axis
    for i, d in enumerate(drinks):
        xx  = cx(d["time_min"])
        lbl = d.get("label", f"D{i+1}")
        parts.append(
            f'<line x1="{xx:.1f}" y1="{MT+PH-6:.1f}" x2="{xx:.1f}" y2="{MT+PH+6:.1f}" '
            f'stroke="#1d4ed8" stroke-width="2"/>'
            f'<text x="{xx:.1f}" y="{MT+PH+28:.1f}" fill="#1d4ed8" '
            f'font-size="9" text-anchor="middle">{lbl}</text>'
        )

    # Axes
    parts.append(
        f'<line x1="{ML}" y1="{MT}" x2="{ML}" y2="{MT+PH}" '
        f'stroke="#374151" stroke-width="1.5"/>'
        f'<line x1="{ML}" y1="{MT+PH}" x2="{ML+PW}" y2="{MT+PH}" '
        f'stroke="#374151" stroke-width="1.5"/>'
    )

    # Y axis tick labels
    y_val = 0.0
    while y_val <= bac_max:
        yy = cy(y_val)
        if grid_step < 0.01:
            label_fmt = f'{y_val:.3f} %'
        else:
            label_fmt = f'{y_val:.2f} %'
        parts.append(
            f'<text x="{ML-5}" y="{yy:.1f}" fill="#374151" '
            f'font-size="10" text-anchor="end" dominant-baseline="middle">'
            f'{label_fmt}</text>'
            f'<line x1="{ML-3}" y1="{yy:.1f}" x2="{ML}" y2="{yy:.1f}" '
            f'stroke="#374151" stroke-width="1"/>'
        )
        y_val += grid_step
        y_val = round(y_val, 4)

    # X axis tick labels (every 30 min)
    t_tick = (t_min_x // 30 + 1) * 30
    while t_tick <= t_max_x:
        xx = cx(t_tick)
        parts.append(
            f'<text x="{xx:.1f}" y="{MT+PH+44:.1f}" fill="#374151" '
            f'font-size="10" text-anchor="middle">{fmt_hhmm(t_tick)}</text>'
            f'<line x1="{xx:.1f}" y1="{MT+PH}" x2="{xx:.1f}" y2="{MT+PH+4}" '
            f'stroke="#374151" stroke-width="1"/>'
        )
        t_tick += 30

    # Axis titles
    parts.append(
        f'<text x="{ML + PW/2:.0f}" y="{H-4}" fill="#374151" '
        f'font-size="11" text-anchor="middle">Time</text>'
        f'<text x="14" y="{MT + PH/2:.0f}" fill="#374151" '
        f'font-size="11" text-anchor="middle" '
        f'transform="rotate(-90,14,{MT + PH/2:.0f})">BAC (%)</text>'
    )

    # Legend
    legend_items = [("Main curve", "#2563eb", "solid")]
    if extra_series and extra_label:
        legend_items.append((extra_label, "#9ca3af", "dashed"))
    if show_uncertainty:
        legend_items.append(("\u00b121 % uncertainty", "#bfdbfe", "band"))
    lx, ly = ML + 8, MT + 10
    for item_label, item_col, item_style in legend_items:
        if item_style == "band":
            parts.append(
                f'<rect x="{lx}" y="{ly - 5}" width="22" height="10" '
                f'fill="{item_col}" fill-opacity="0.7"/>'
            )
        elif item_style == "dashed":
            parts.append(
                f'<line x1="{lx}" y1="{ly}" x2="{lx+22}" y2="{ly}" '
                f'stroke="{item_col}" stroke-width="2" stroke-dasharray="6,4"/>'
            )
        else:
            parts.append(
                f'<line x1="{lx}" y1="{ly}" x2="{lx+22}" y2="{ly}" '
                f'stroke="{item_col}" stroke-width="2.5"/>'
            )
        parts.append(
            f'<text x="{lx+26}" y="{ly}" fill="#374151" '
            f'font-size="10" dominant-baseline="middle">{item_label}</text>'
        )
        ly += 16

    # Chart title
    parts.append(
        f'<text x="{W//2}" y="20" fill="#111827" font-size="13" '
        f'font-weight="bold" text-anchor="middle">{title}</text>'
    )

    # Profile annotation
    parts.append(
        f'<text x="{ML+PW}" y="{MT+10}" fill="#6b7280" font-size="9" '
        f'text-anchor="end">Profile: male, 70 kg, 175 cm \u00b7 r=0.789 '
        f'\u00b7 \u03b2\u2098\u2090\u2093=0.015 %/h \u00b7 K\u2098=0.015 %</text>'
    )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
        f'font-family="system-ui,sans-serif">\n'
        + "\n".join(parts)
        + "\n</svg>\n"
    )

    out_path = os.path.join(os.path.dirname(__file__), "..", "images", filename)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        f.write(svg)

    peak_bac = max(b for _, b in series)
    print(f"  wrote {filename}  (peak BAC: {peak_bac:.4f} %)")
    return peak_bac


# ── Example definitions ────────────────────────────────────────────────────────
# All times in minutes from midnight.
# 18:00 = 1080, 18:30 = 1110, 19:00 = 1140, 19:30 = 1170, 20:00 = 1200,
# 20:30 = 1230, 21:00 = 1260, 21:30 = 1290

def build_and_save(name, title, drinks, food_events, t_pad_start=30,
                   extra_drinks=None, extra_food=None, extra_label=None,
                   show_uncertainty=False):
    events_start = min(
        [d["time_min"] for d in drinks]
        + ([fe["time_min"] for fe in food_events] if food_events else [])
    )
    main_series = bac_series(drinks, food_events,
                             events_start - t_pad_start, events_start + 360)
    sober = find_sober_time(main_series)
    main_series = bac_series(drinks, food_events,
                             events_start - t_pad_start, sober)

    extra_series = None
    if extra_drinks is not None:
        extra_series = bac_series(extra_drinks, extra_food or [],
                                  events_start - t_pad_start, sober)

    return make_svg(main_series, drinks, food_events, title, f"{name}.svg",
                    extra_series=extra_series, extra_label=extra_label,
                    show_uncertainty=show_uncertainty)


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("Generating BAC curve SVGs (Michaelis-Menten elimination model) ...")
    print(f"  Profile: male, {WEIGHT_KG} kg, {HEIGHT_CM} cm, r={R_SEIDL:.3f}")
    print(f"  Elimination: \u03b2_max={BETA_MAX} %/h, Km={KM} %")
    print()

    peaks = {}

    # ── Example 1: Three wines, fasted ────────────────────────────────────────
    drinks_ex1 = [
        {"time_min": 1140, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 1\n19:00"},
        {"time_min": 1200, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 2\n20:00"},
        {"time_min": 1260, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 3\n21:00"},
    ]
    peaks["ex1"] = build_and_save(
        "ex1_fasted",
        "Example 1 \u2014 Three wines, no food (baseline + uncertainty band)",
        drinks_ex1, [],
        show_uncertainty=True,
    )

    # ── Example 2: Heavy meal 30 min before drinking ──────────────────────────
    drinks_ex2 = [
        {"time_min": 1140, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 1\n19:00"},
        {"time_min": 1200, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 2\n20:00"},
        {"time_min": 1260, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 3\n21:00"},
    ]
    food_ex2 = [{"time_min": 1110, "type": "heavy_meal"}]   # 18:30
    peaks["ex2"] = build_and_save(
        "ex2_meal_before",
        "Example 2 \u2014 Heavy meal at 18:30, drinks at 19:00 / 20:00 / 21:00",
        drinks_ex2, food_ex2,
        extra_drinks=drinks_ex1, extra_food=[], extra_label="Fasted (Ex. 1)",
    )

    # ── Example 3: Drink 1 h before eating — NOT retroactively covered ────────
    drinks_ex3 = [
        {"time_min": 1140, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 1\n19:00"},
        {"time_min": 1230, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 2\n20:30"},
        {"time_min": 1290, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 3\n21:30"},
    ]
    food_ex3 = [{"time_min": 1200, "type": "full_meal"}]    # 20:00
    peaks["ex3"] = build_and_save(
        "ex3_drink_before_meal_not_covered",
        "Example 3 \u2014 Wine 1 (19:00) fully absorbed before meal (20:00): not covered",
        drinks_ex3, food_ex3,
    )

    # ── Example 4: Drink 30 min before eating — IS covered (Case B) ──────────
    drinks_ex4 = [
        {"time_min": 1170, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 1\n19:30"},
        {"time_min": 1230, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 2\n20:30"},
        {"time_min": 1290, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 3\n21:30"},
    ]
    food_ex4 = [{"time_min": 1200, "type": "full_meal"}]    # 20:00
    peaks["ex4"] = build_and_save(
        "ex4_drink_before_meal_covered",
        "Example 4 \u2014 Wine 1 (19:30) still absorbing when meal arrives (20:00): covered",
        drinks_ex4, food_ex4,
        extra_drinks=drinks_ex3, extra_food=food_ex3,
        extra_label="Ex. 3 (not covered)",
    )

    # ── Example 5: Snack mid-session (limited post_window = 60 min) ──────────
    drinks_ex5 = [
        {"time_min": 1140, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 1\n19:00"},
        {"time_min": 1200, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 2\n20:00"},
        {"time_min": 1260, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 3\n21:00"},
    ]
    food_ex5 = [{"time_min": 1170, "type": "snack"}]        # 19:30
    peaks["ex5"] = build_and_save(
        "ex5_snack_mid_session",
        "Example 5 \u2014 Snack at 19:30: Wines 1 & 2 covered, Wine 3 fasted",
        drinks_ex5, food_ex5,
        extra_drinks=drinks_ex1, extra_food=[], extra_label="Fasted (Ex. 1)",
    )

    # ── Example 6: Champagne at dinner (carbonated + food) ───────────────────
    drinks_ex6_main = [
        {"time_min": 1140, "volume_ml": 125, "abv": 12, "carbonated": True,
         "label": "Champagne\n19:00"},
        {"time_min": 1200, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 1\n20:00"},
        {"time_min": 1260, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 2\n21:00"},
    ]
    food_ex6 = [{"time_min": 1110, "type": "full_meal"}]    # 18:30
    drinks_ex6_fasted = [
        {"time_min": 1140, "volume_ml": 125, "abv": 12, "carbonated": True,
         "label": "Champagne\n19:00"},
        {"time_min": 1200, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 1\n20:00"},
        {"time_min": 1260, "volume_ml": 150, "abv": 12, "carbonated": False,
         "label": "Wine 2\n21:00"},
    ]
    peaks["ex6"] = build_and_save(
        "ex6_champagne_dinner",
        "Example 6 \u2014 Champagne at dinner: food overrides carbonation",
        drinks_ex6_main, food_ex6,
        extra_drinks=drinks_ex6_fasted, extra_food=[],
        extra_label="Same drinks, fasted",
    )

    # ── Summary ──────────────────────────────────────────────────────────────
    print()
    print("=== Summary ===")
    print(f"  Ex 1 (fasted baseline):     peak = {peaks['ex1']:.4f} %")
    print(f"  Ex 2 (heavy meal before):   peak = {peaks['ex2']:.4f} %"
          f"  ({peaks['ex2']/peaks['ex1']*100:.0f} % of fasted)")
    print(f"  Ex 3 (drink 1h before food): peak = {peaks['ex3']:.4f} %")
    print(f"  Ex 4 (drink 30m before, Case B): peak = {peaks['ex4']:.4f} %")
    print(f"  Ex 5 (snack mid-session):   peak = {peaks['ex5']:.4f} %"
          f"  ({peaks['ex5']/peaks['ex1']*100:.0f} % of fasted)")
    print(f"  Ex 6 (champagne+dinner):    peak = {peaks['ex6']:.4f} %"
          f"  ({peaks['ex6']/peaks['ex1']*100:.0f} % of fasted)")
    print()
    print("Done. SVGs written to images/")
