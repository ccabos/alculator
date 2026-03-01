/**
 * Alculator — Display / Readout Rendering
 * @module ui/display
 *
 * Renders the BAC numeric readout, safety badge, sober-time indicator,
 * and the session log.  All functions accept data and write directly to the DOM.
 * No side effects beyond DOM mutation.
 */

import { BAC_THRESHOLDS } from '../model/constants.js';

// ─── BAC display ──────────────────────────────────────────────────────────────

/**
 * Map a BAC value to its badge class and label.
 * @param {number} bac_pct
 * @returns {{ cls: string, label: string }}
 */
function bacCategory(bac_pct) {
  if (bac_pct <= 0)                          return { cls: 'badge-sober', label: 'Sober' };
  if (bac_pct < BAC_THRESHOLDS.tipsy)        return { cls: 'badge-buzz',  label: 'Buzz' };
  if (bac_pct < BAC_THRESHOLDS.drunk)        return { cls: 'badge-tipsy', label: 'Tipsy' };
  if (bac_pct < BAC_THRESHOLDS.heavy)        return { cls: 'badge-drunk', label: 'Drunk' };
  return                                            { cls: 'badge-heavy', label: 'Heavy' };
}

/**
 * Render the large BAC readout in the header.
 *
 * @param {number} bac_pct        — central estimate
 * @param {{ lower: number, upper: number }|null} bounds — uncertainty bounds, or null to hide
 */
export function renderBACDisplay(bac_pct, bounds) {
  const valueEl   = document.getElementById('bac-value');
  const badgeEl   = document.getElementById('bac-badge');
  const rangeEl   = document.getElementById('bac-range');
  const cautionEl = document.getElementById('bac-caution');

  // Numeric value (convert % BAC → promille: × 10)
  valueEl.textContent = (bac_pct * 10).toFixed(2);

  // Badge
  const { cls, label } = bacCategory(bac_pct);
  badgeEl.className  = `badge ${cls}`;
  badgeEl.textContent = label;

  // Range string (compact, inline with the value)
  if (bounds) {
    rangeEl.textContent = `(${(bounds.lower * 10).toFixed(2)}–${(bounds.upper * 10).toFixed(2)})`;
    rangeEl.hidden = false;
  } else {
    rangeEl.hidden = true;
  }

  // Caution note when upper bound exceeds 0.08 %
  if (bounds && bounds.upper > 0.08) {
    cautionEl.hidden = false;
  } else {
    cautionEl.hidden = true;
  }
}

// ─── Sober time ───────────────────────────────────────────────────────────────

/**
 * Render the "sober by" row.
 *
 * @param {number|null} t_min — absolute minutes from midnight when sober, or null
 */
export function renderSoberTime(t_min) {
  const el = document.getElementById('sober-time');
  if (t_min === null) {
    el.textContent = '—';
    return;
  }
  const h = Math.floor(t_min / 60) % 24;
  const m = Math.round(t_min) % 60;
  el.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Session log ──────────────────────────────────────────────────────────────

/**
 * Format minutes-from-midnight as HH:MM, wrapping correctly past midnight.
 * @param {number} t_min
 * @returns {string}
 */
function fmtTime(t_min) {
  const h = Math.floor(t_min / 60) % 24;
  const m = Math.round(t_min) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Wrap an absolute-minute value to the 0–1439 clock range. */
function wrapTime(t) { return ((t % 1440) + 1440) % 1440; }

const MEAL_LABELS = {
  snack:      'Snack',
  light_meal: 'Light meal',
  full_meal:  'Full meal',
  heavy_meal: 'Heavy meal',
};

/**
 * Render the interleaved, reverse-chronological session log.
 *
 * @param {object[]} drinks
 * @param {object[]} food_events
 * @param {object[]} presets          — array of preset objects for name lookup
 * @param {Function} onDeleteDrink    — callback(index)
 * @param {Function} onDeleteFood     — callback(index)
 * @param {Function} onEditDrink      — callback(index)
 * @param {Function} onEditFood       — callback(index)
 * @param {Function} [onGestureDrink] — callback(index, deltaTimeMins, deltaDurationMins)
 * @param {Function} [onChartUpdate]  — callback(index, deltaTimeMins, deltaDurationMins)
 * @param {Function} [onGestureFood]  — callback(index, deltaTimeMins)
 * @param {Function} [onFoodChartUpdate] — callback(index, deltaTimeMins)
 */
export function renderSessionLog(
  drinks, food_events, presets,
  onDeleteDrink, onDeleteFood,
  onEditDrink,   onEditFood,
  onGestureDrink, onChartUpdate,
  onGestureFood,  onFoodChartUpdate,
) {
  const container = document.getElementById('log-entries');

  if (drinks.length === 0 && food_events.length === 0) {
    container.innerHTML = '<p class="log-empty">No drinks logged yet.</p>';
    return;
  }

  // Build unified event list
  const events = [
    ...drinks.map((d, i)      => ({ kind: 'drink', index: i, t: d.time_min, data: d })),
    ...food_events.map((f, i) => ({ kind: 'food',  index: i, t: f.time_min, data: f })),
  ];
  // Sort descending (most recent first)
  events.sort((a, b) => b.t - a.t || (b.kind === 'food' ? -1 : 1));

  const presetMap = Object.fromEntries((presets ?? []).map(p => [p.id, p]));

  const html = events.map(ev => {
    if (ev.kind === 'drink') {
      const d = ev.data;
      const preset = d.preset_id ? presetMap[d.preset_id] : null;
      const name = preset ? preset.name : 'Custom drink';
      const meta = _buildDrinkMeta(d.volume_ml, d.abv_pct, d.duration_min, d.carbonated, d.with_food);

      return `<div class="log-entry log-entry-drink" data-kind="drink" data-index="${ev.index}"
              data-orig-time-min="${d.time_min}" data-orig-duration-min="${d.duration_min ?? 0}"
              data-volume-ml="${d.volume_ml}" data-abv-pct="${d.abv_pct}"
              data-carbonated="${d.carbonated}" data-with-food="${d.with_food}"
              role="button" tabindex="0" aria-label="Edit ${esc(name)}">
        <span class="log-entry-icon" aria-hidden="true">${drinkIcon(d.preset_id)}</span>
        <div class="log-entry-main">
          <div class="log-entry-name">${esc(name)}</div>
          <div class="log-entry-meta">${esc(meta)}</div>
        </div>
        <span class="log-entry-time">${fmtTime(d.time_min)}</span>
        <div class="log-entry-actions">
          <button class="log-action-btn delete-drink-btn" data-index="${ev.index}"
                  aria-label="Delete drink">✕</button>
        </div>
      </div>`;
    } else {
      const f = ev.data;
      const label = MEAL_LABELS[f.type] ?? f.type;
      return `<div class="log-entry log-entry-food" data-kind="food" data-index="${ev.index}"
              data-orig-time-min="${f.time_min}"
              role="button" tabindex="0" aria-label="Edit ${esc(label)}">
        <span class="log-entry-icon" aria-hidden="true">🍽</span>
        <div class="log-entry-main">
          <div class="log-entry-name">${esc(label)}</div>
          ${f.note ? `<div class="log-entry-meta">${esc(f.note)}</div>` : ''}
        </div>
        <span class="log-entry-time">${fmtTime(f.time_min)}</span>
        <div class="log-entry-actions">
          <button class="log-action-btn delete-food-btn" data-index="${ev.index}"
                  aria-label="Delete food event">✕</button>
        </div>
      </div>`;
    }
  }).join('');

  container.innerHTML = html;

  // Drink rows — tap opens edit, hold+drag adjusts time (h) or duration (v)
  container.querySelectorAll('.log-entry-drink').forEach(row => {
    const index = Number(row.dataset.index);
    _bindGestureRow(row, {
      allowVertical:  true,
      onTap:          () => onEditDrink(index),
      onGesture:      (dt, dd) => onGestureDrink?.(index, dt, dd),
      onChartLive:    (dt, dd) => onChartUpdate?.(index, dt, dd),
      updateFeedback: _updateDrinkRowFeedback,
    });
  });

  // Food rows — tap opens edit, hold+drag adjusts time (h only)
  container.querySelectorAll('.log-entry-food').forEach(row => {
    const index = Number(row.dataset.index);
    _bindGestureRow(row, {
      allowVertical:  false,
      onTap:          () => onEditFood(index),
      onGesture:      (dt) => onGestureFood?.(index, dt),
      onChartLive:    (dt) => onFoodChartUpdate?.(index, dt),
      updateFeedback: _updateFoodRowFeedback,
    });
  });

  // Delete buttons
  container.querySelectorAll('.delete-drink-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      onDeleteDrink(Number(btn.dataset.index));
    });
  });
  container.querySelectorAll('.delete-food-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      onDeleteFood(Number(btn.dataset.index));
    });
  });
}

// ─── Shared gesture handler ────────────────────────────────────────────────────

/** ms the pointer must be held still before drag mode activates. */
const LONG_PRESS_MS    = 300;
/** px of movement during the hold that cancels the gesture (scroll intent). */
const ABORT_THRESHOLD  = 10;
/** px of drag travel after activation that equals 1 minute of change. */
const PX_PER_MIN       = 3;
/** px of movement after activation before the axis is locked. */
const DRAG_THRESHOLD   = 8;

/**
 * Bind a unified long-press + drag gesture to a single log-entry row.
 *
 * Interaction model:
 *   • Short tap (< LONG_PRESS_MS, < ABORT_THRESHOLD movement) → onTap()
 *   • Hold LONG_PRESS_MS without moving → gesture activates (haptic + visual)
 *   • Horizontal drag after activation → onGesture(dtTime, 0), live onChartLive
 *   • Vertical drag after activation (allowVertical) → onGesture(0, dtDur), live onChartLive
 *   • pointercancel (browser takes over for scroll) → clears timer, restores chart
 *
 * touch-action: pan-y on the row (set via CSS) allows normal vertical page-scroll
 * before the hold completes.  Once the hold fires, touch-action is switched to
 * none so the browser can no longer fire pointercancel for vertical movement,
 * enabling both vertical duration drags and diagonal deviations from a locked
 * horizontal axis without the gesture being cancelled.
 *
 * @param {HTMLElement} row
 * @param {{ allowVertical: boolean, onTap: Function, onGesture: Function,
 *           onChartLive: Function, updateFeedback: Function }} config
 */
function _bindGestureRow(row, { allowVertical, onTap, onGesture, onChartLive, updateFeedback }) {
  let startX = 0, startY = 0;
  let axisLocked      = null;
  let didDrag         = false;
  let activePointerId = null;
  let gestureReady    = false;
  let longPressTimer  = null;
  let lastDtTime      = 0;
  let lastDtDur       = 0;

  const activateGesture = () => {
    if (activePointerId == null) return;
    gestureReady = true;
    // Switch to touch-action:none so the browser can no longer intercept
    // vertical movement for scrolling.  The CSS sets pan-y (allowing page
    // scroll before the hold completes); we override it here so that both
    // vertical duration drags and diagonal deviations during a horizontal
    // drag no longer fire pointercancel.
    row.style.touchAction = 'none';
    row.setPointerCapture(activePointerId);
    row.classList.add('log-entry-held');
    navigator.vibrate?.(15);
  };

  const reset = () => {
    row.style.touchAction = ''; // restore CSS pan-y
    clearTimeout(longPressTimer);
    longPressTimer  = null;
    axisLocked      = null;
    didDrag         = false;
    activePointerId = null;
    gestureReady    = false;
    lastDtTime      = 0;
    lastDtDur       = 0;
    row.classList.remove('log-entry-held', 'log-entry-dragging', 'log-entry-drag-x', 'log-entry-drag-y');
  };

  row.addEventListener('pointerdown', e => {
    if (e.target.closest('.log-action-btn')) return;
    startX          = e.clientX;
    startY          = e.clientY;
    axisLocked      = null;
    didDrag         = false;
    gestureReady    = false;
    lastDtTime      = 0;
    lastDtDur       = 0;
    activePointerId = e.pointerId;
    longPressTimer  = setTimeout(activateGesture, LONG_PRESS_MS);
  });

  row.addEventListener('pointermove', e => {
    if (activePointerId !== e.pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!gestureReady) {
      // During hold: cancel if the pointer moved too far (user intends to scroll)
      if (Math.abs(dx) > ABORT_THRESHOLD || Math.abs(dy) > ABORT_THRESHOLD) {
        clearTimeout(longPressTimer);
        longPressTimer  = null;
        activePointerId = null;
      }
      return;
    }

    // Gesture active: lock axis on first significant movement
    if (!axisLocked && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      axisLocked = (allowVertical && Math.abs(dy) > Math.abs(dx)) ? 'y' : 'x';
      didDrag    = true;
      row.classList.add('log-entry-dragging',
        axisLocked === 'x' ? 'log-entry-drag-x' : 'log-entry-drag-y');
    }

    if (axisLocked) {
      e.preventDefault(); // block scroll once axis is committed
      const dtTime = axisLocked === 'x' ? Math.round(dx / PX_PER_MIN) : 0;
      const dtDur  = axisLocked === 'y' ? -Math.round(dy / PX_PER_MIN) : 0;
      updateFeedback(row, dtTime, dtDur);
      if (onChartLive && (dtTime !== lastDtTime || dtDur !== lastDtDur)) {
        lastDtTime = dtTime;
        lastDtDur  = dtDur;
        onChartLive(dtTime, dtDur);
      }
    }
  });

  row.addEventListener('pointerup', e => {
    if (activePointerId !== e.pointerId) return;
    const wasReady = gestureReady;
    const wasDrag  = didDrag && axisLocked;
    const finalDx  = e.clientX - startX;
    const finalDy  = e.clientY - startY;
    const finalAxis = axisLocked;
    reset();

    if (wasReady && wasDrag) {
      const dtTime = finalAxis === 'x' ? Math.round(finalDx / PX_PER_MIN) : 0;
      const dtDur  = finalAxis === 'y' ? -Math.round(finalDy / PX_PER_MIN) : 0;
      onGesture?.(dtTime, dtDur);
    } else {
      // Short tap or hold-without-drag: open edit panel
      onTap?.();
    }
  });

  row.addEventListener('pointercancel', e => {
    if (activePointerId !== e.pointerId) return;
    // Browser took over (e.g. scroll); restore chart preview and clear state
    updateFeedback(row, 0, 0);
    if (onChartLive) onChartLive(0, 0);
    reset();
  });

  row.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap?.(); }
  });
}

// ─── Row feedback helpers ──────────────────────────────────────────────────────

/**
 * Rebuild the drink meta string from raw fields (matches the log HTML).
 */
function _buildDrinkMeta(volume_ml, abv_pct, duration_min, carbonated, with_food) {
  return [
    `${volume_ml} mL`,
    `${abv_pct} % ABV`,
    duration_min ? `${duration_min} min` : null,
    carbonated   ? 'carbonated' : null,
    with_food    ? 'with food'  : null,
  ].filter(Boolean).join(' · ');
}

/**
 * Update the time label and meta text of a drink row during drag.
 * Time wraps around midnight; duration is clamped to [0, 180].
 */
function _updateDrinkRowFeedback(row, dtTime, dtDur) {
  const origTime = Number(row.dataset.origTimeMin);
  const origDur  = Number(row.dataset.origDurationMin);

  // origTime may be a normalized value (> 1440); reduce to clock range before wrapping.
  const newTime = wrapTime(origTime % 1440 + dtTime);
  const newDur  = Math.max(0, Math.min(180, origDur + dtDur));

  const timeEl = row.querySelector('.log-entry-time');
  const metaEl = row.querySelector('.log-entry-meta');

  if (timeEl) {
    timeEl.textContent = fmtTime(newTime);
    timeEl.classList.toggle('log-entry-feedback-active', dtTime !== 0);
  }
  if (metaEl) {
    const volume_ml  = Number(row.dataset.volumeMl);
    const abv_pct    = Number(row.dataset.abvPct);
    const carbonated = row.dataset.carbonated === 'true';
    const with_food  = row.dataset.withFood   === 'true';
    metaEl.textContent = _buildDrinkMeta(volume_ml, abv_pct, newDur, carbonated, with_food);
    metaEl.classList.toggle('log-entry-feedback-active', dtDur !== 0);
  }
}

/**
 * Update the time label of a food row during drag.
 * Time wraps around midnight.
 */
function _updateFoodRowFeedback(row, dtTime) {
  const origTime = Number(row.dataset.origTimeMin);
  const newTime  = wrapTime(origTime % 1440 + dtTime);
  const timeEl   = row.querySelector('.log-entry-time');
  if (timeEl) {
    timeEl.textContent = fmtTime(newTime);
    timeEl.classList.toggle('log-entry-feedback-active', dtTime !== 0);
  }
}

// ─── Drink icon ───────────────────────────────────────────────────────────────

const BEER_PRESET_IDS = new Set(['beer_regular', 'beer_pint']);

function drinkIcon(preset_id) {
  if (BEER_PRESET_IDS.has(preset_id)) return '🍺';
  if (preset_id === 'champagne')       return '🥂';
  if (preset_id === 'cocktail')        return '🍹';
  return '🍷';
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Escape HTML entities to prevent XSS. */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
