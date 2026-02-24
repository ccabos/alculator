/**
 * Alculator — BAC Chart (plain SVG, no library)
 * @module ui/chart
 *
 * Renders the BAC time series as an SVG chart directly into #bac-chart.
 * Redraws completely on every call to renderChart().
 *
 * Features:
 *   • Past curve: full opacity; future (forecast): reduced opacity
 *   • Reference lines at 0.05 % and 0.08 %
 *   • Vertical current-time marker
 *   • Drink tick marks on the time axis
 *   • Food icons on the time axis with meal-size abbreviation
 *   • Toggleable uncertainty band
 *   • Tap/click tooltip with BAC and clock time
 *   • Readable at 375 px width without horizontal scroll
 */

import { uncertaintyBounds } from '../model/bac.js';
import { BAC_THRESHOLDS }    from '../model/constants.js';

// ─── Layout constants ──────────────────────────────────────────────────────────

const ML = 48;  // margin left (px)
const MR = 12;  // margin right
const MT = 20;  // margin top
const MB = 48;  // margin bottom (room for time axis)

const REF_LINES = [
  { bac: 0.05, label: '0.5', color: '#f59e0b' },
  { bac: 0.08, label: '0.8', color: '#ef4444' },
];

const BEER_PRESET_IDS = new Set(['beer_regular', 'beer_pint']);

function _drinkIcon(preset_id) {
  if (BEER_PRESET_IDS.has(preset_id)) return '🍺';
  if (preset_id === 'champagne')       return '🥂';
  return '🍷';
}

const MEAL_ABBR = {
  snack:      'S',
  light_meal: 'L',
  full_meal:  'F',
  heavy_meal: 'H',
};

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Render the BAC chart.
 *
 * @param {Array<{ t_min: number, bac_pct: number }>} series
 * @param {object[]} drinks
 * @param {object[]} food_events
 * @param {number}   now_min       — current time in minutes from midnight
 * @param {boolean}  showUncertainty
 */
export function renderChart(series, drinks, food_events, now_min, showUncertainty) {
  const svgEl = document.getElementById('bac-chart');
  if (!svgEl || !series || series.length === 0) return;

  // Determine chart dimensions from the element's rendered width
  const W = Math.max(375, svgEl.parentElement?.clientWidth || 375);
  const H = Math.round(W * 0.45); // ~45 % aspect ratio
  const PW = W - ML - MR;
  const PH = H - MT - MB;

  // Axes ranges
  const t_min_x = series[0].t_min;
  const t_max_x = series[series.length - 1].t_min;
  const t_span  = Math.max(t_max_x - t_min_x, 1);
  const peak    = Math.max(...series.map(p => p.bac_pct), 0.05);
  const bac_max = Math.max(peak * 1.3, 0.10);

  // Coordinate helpers
  const tx = t  => ML + (t - t_min_x) / t_span * PW;
  const by = b  => MT + PH - (b / bac_max) * PH;

  // ── Build SVG parts ─────────────────────────────────────────────────────────

  const parts = [];

  // Background
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="var(--c-bg,#f9fafb)"/>`);
  parts.push(`<rect x="${ML}" y="${MT}" width="${PW}" height="${PH}"
    fill="var(--c-surface,#fff)" stroke="var(--c-border,#e5e7eb)" stroke-width="1"/>`);

  // Y-axis grid lines + labels (values in promille: BAC% × 10)
  const yTicks = _niceTicks(0, bac_max, 5);
  for (const v of yTicks) {
    const y = by(v);
    parts.push(`<line x1="${ML}" y1="${y}" x2="${ML + PW}" y2="${y}"
      stroke="var(--c-border,#e5e7eb)" stroke-width="0.5"/>`);
    parts.push(`<text x="${ML - 4}" y="${y}" text-anchor="end" dominant-baseline="middle"
      font-size="9" fill="var(--c-muted,#6b7280)">${(v * 10).toFixed(2)}</text>`);
  }
  // Y-axis title
  parts.push(`<text x="${12}" y="${MT + PH / 2}" text-anchor="middle" dominant-baseline="middle"
    font-size="9" fill="var(--c-muted,#6b7280)"
    transform="rotate(-90, 12, ${MT + PH / 2})">‰</text>`);

  // Reference lines
  for (const ref of REF_LINES) {
    if (ref.bac > bac_max) continue;
    const y = by(ref.bac);
    parts.push(`<line x1="${ML}" y1="${y}" x2="${ML + PW}" y2="${y}"
      stroke="${ref.color}" stroke-width="1" stroke-dasharray="4,3"/>`);
    parts.push(`<text x="${ML + PW - 2}" y="${y - 3}" text-anchor="end"
      font-size="9" fill="${ref.color}">${ref.label} ‰</text>`);
  }

  // X-axis time labels
  const xTicks = _timeTicksEvery30(t_min_x, t_max_x);
  for (const t of xTicks) {
    const x = tx(t);
    parts.push(`<line x1="${x}" y1="${MT + PH}" x2="${x}" y2="${MT + PH + 4}"
      stroke="var(--c-border,#e5e7eb)" stroke-width="1"/>`);
    parts.push(`<text x="${x}" y="${MT + PH + 14}" text-anchor="middle"
      font-size="9" fill="var(--c-muted,#6b7280)">${_fmtHHMM(t)}</text>`);
  }

  // Uncertainty band (behind the curve)
  if (showUncertainty) {
    const upperPts = series.map(p => `${tx(p.t_min)},${by(Math.min(bac_max, uncertaintyBounds(p.bac_pct).upper))}`).join(' ');
    const lowerPts = [...series].reverse().map(p => `${tx(p.t_min)},${by(uncertaintyBounds(p.bac_pct).lower)}`).join(' ');
    parts.push(`<polygon points="${upperPts} ${lowerPts}"
      fill="#3b82f6" fill-opacity="0.12" stroke="none"/>`);
  }

  // Split series into past and future
  const pastSeries   = series.filter(p => p.t_min <= now_min);
  const futureSeries = series.filter(p => p.t_min >= now_min);

  // Past curve (full opacity)
  if (pastSeries.length > 1) {
    const pts = pastSeries.map(p => `${tx(p.t_min)},${by(p.bac_pct)}`).join(' ');
    parts.push(`<polyline points="${pts}"
      fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
  }

  // Future curve (reduced opacity)
  if (futureSeries.length > 1) {
    const pts = futureSeries.map(p => `${tx(p.t_min)},${by(p.bac_pct)}`).join(' ');
    parts.push(`<polyline points="${pts}"
      fill="none" stroke="#93c5fd" stroke-width="1.5" stroke-dasharray="4,2"
      stroke-linejoin="round" stroke-linecap="round"/>`);
  }

  // Current-time vertical marker
  if (now_min >= t_min_x && now_min <= t_max_x) {
    const nx = tx(now_min);
    parts.push(`<line x1="${nx}" y1="${MT}" x2="${nx}" y2="${MT + PH}"
      stroke="#6b7280" stroke-width="1" stroke-dasharray="2,2"/>`);
    parts.push(`<text x="${nx + 2}" y="${MT + 8}" font-size="8"
      fill="var(--c-muted,#6b7280)">now</text>`);
  }

  // Drink tick marks on time axis
  for (const d of drinks) {
    if (d.time_min < t_min_x || d.time_min > t_max_x) continue;
    const x = tx(d.time_min);
    parts.push(`<line x1="${x}" y1="${MT + PH}" x2="${x}" y2="${MT + PH + 8}"
      stroke="#2563eb" stroke-width="2"/>`);
    parts.push(`<text x="${x}" y="${MT + PH + 26}" text-anchor="middle"
      font-size="8" fill="#2563eb">${_drinkIcon(d.preset_id)}</text>`);
  }

  // Food icons on time axis
  for (const f of food_events) {
    if (f.time_min < t_min_x || f.time_min > t_max_x) continue;
    const x  = tx(f.time_min);
    const ab = MEAL_ABBR[f.type] ?? '?';
    parts.push(`<text x="${x}" y="${MT + PH + 38}" text-anchor="middle"
      font-size="8" fill="#16a34a">${ab}</text>`);
  }

  // Invisible touch/click capture overlay (for tooltip)
  parts.push(`<rect id="chart-hit-area"
    x="${ML}" y="${MT}" width="${PW}" height="${PH}"
    fill="transparent" style="cursor:crosshair"
    data-t-start="${t_min_x}" data-t-end="${t_max_x}"
    data-bac-max="${bac_max}" data-pw="${PW}" data-ph="${PH}"
    data-ml="${ML}" data-mt="${MT}"/>`);

  // ── Write SVG ────────────────────────────────────────────────────────────────

  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.setAttribute('width',  W);
  svgEl.setAttribute('height', H);
  svgEl.innerHTML = parts.join('\n');

  // Bind tooltip after render
  _bindTooltip(svgEl, series, t_min_x, t_max_x, PW, ML, MT);
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function _bindTooltip(svgEl, series, t_min_x, t_max_x, PW, ML, MT) {
  const hitArea = svgEl.querySelector('#chart-hit-area');
  if (!hitArea) return;

  let tooltip = document.getElementById('chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'chart-tooltip';
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
  }

  const t_span = Math.max(t_max_x - t_min_x, 1);

  function showTooltip(e) {
    const rect = svgEl.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const relX = clientX - rect.left - ML;
    if (relX < 0 || relX > PW) { tooltip.hidden = true; return; }
    const t = t_min_x + (relX / PW) * t_span;
    // Find nearest point in series
    const nearest = series.reduce((best, p) =>
      Math.abs(p.t_min - t) < Math.abs(best.t_min - t) ? p : best
    );
    tooltip.textContent = `${(nearest.bac_pct * 10).toFixed(3)} ‰  ·  ${_fmtHHMM(nearest.t_min)}`;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(clientX + 8, window.innerWidth - 120)}px`;
    tooltip.style.top  = `${(e.touches ? e.touches[0].clientY : e.clientY) - 30}px`;
  }

  hitArea.addEventListener('mousemove',  showTooltip);
  hitArea.addEventListener('touchmove',  showTooltip, { passive: true });
  hitArea.addEventListener('mouseleave', () => { tooltip.hidden = true; });
  hitArea.addEventListener('touchend',   () => { setTimeout(() => { tooltip.hidden = true; }, 1500); });
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/** Generate nice round Y-axis tick values. */
function _niceTicks(min, max, count) {
  const range = max - min;
  const step  = _niceNum(range / count, true);
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.01; v += step) {
    ticks.push(Math.round(v * 10000) / 10000);
  }
  return ticks;
}

function _niceNum(range, round) {
  const exp   = Math.floor(Math.log10(range));
  const frac  = range / Math.pow(10, exp);
  let nice;
  if (round) {
    nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  } else {
    nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  }
  return nice * Math.pow(10, exp);
}

/** Generate X-axis ticks every 30 minutes. */
function _timeTicksEvery30(t_start, t_end) {
  const ticks = [];
  const first = Math.ceil(t_start / 30) * 30;
  for (let t = first; t <= t_end; t += 30) ticks.push(t);
  return ticks;
}

/** Format minutes-from-midnight as HH:MM. */
function _fmtHHMM(t_min) {
  const h = Math.floor(t_min / 60) % 24;
  const m = Math.round(t_min) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
