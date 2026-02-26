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
 * @param {number|null} t_min       — absolute minutes from midnight when sober, or null
 * @param {number}      session_start_min — session start (for context), unused currently
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
 * Format minutes-from-midnight as HH:MM.
 * @param {number} t_min
 * @returns {string}
 */
function fmtTime(t_min) {
  const h = Math.floor(t_min / 60) % 24;
  const m = Math.round(t_min) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

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
 * @param {object[]} presets       — array of preset objects for name lookup
 * @param {Function} onDeleteDrink — callback(index)
 * @param {Function} onDeleteFood  — callback(index)
 * @param {Function} onEditDrink   — callback(index)
 * @param {Function} onEditFood    — callback(index)
 * @param {Function} [onGestureDrink] — callback(index, deltaTimeMins, deltaDurationMins)
 */
export function renderSessionLog(drinks, food_events, presets, onDeleteDrink, onDeleteFood, onEditDrink, onEditFood, onGestureDrink) {
  const container = document.getElementById('log-entries');

  if (drinks.length === 0 && food_events.length === 0) {
    container.innerHTML = '<p class="log-empty">No drinks logged yet.</p>';
    return;
  }

  // Build unified event list
  const events = [
    ...drinks.map((d, i)     => ({ kind: 'drink', index: i, t: d.time_min, data: d })),
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

  // Drink rows: gesture-aware handler (tap = edit, drag = adjust time/duration)
  _bindDrinkRows(container, onEditDrink, onGestureDrink);

  // Food rows: click/keyboard to edit
  function _bindRowEdit(selector, onEdit) {
    container.querySelectorAll(selector).forEach(row => {
      const handler = e => {
        if (e.target.closest('.log-action-btn')) return;
        onEdit(Number(row.dataset.index));
      };
      row.addEventListener('click', handler);
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(e); }
      });
    });
  }
  _bindRowEdit('.log-entry-food', onEditFood);

  // Bind delete buttons
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

// ─── Drink gesture handler ────────────────────────────────────────────────────

/** Pixels of pointer travel that equal 1 minute of time or duration change. */
const PX_PER_MIN = 3;

/** Minimum pointer travel (px) to begin a drag gesture. */
const DRAG_THRESHOLD = 8;

/**
 * Bind pointer-based tap/drag interaction to all drink log entries.
 *
 * A short press with minimal movement is treated as a tap → opens edit panel.
 * Pressing and dragging horizontally adjusts `time_min` (start time).
 * Pressing and dragging vertically adjusts `duration_min` (drinking duration).
 *
 * @param {HTMLElement} container
 * @param {Function} onEditDrink     — callback(index)
 * @param {Function} [onGestureDrink] — callback(index, deltaTimeMins, deltaDurationMins)
 */
function _bindDrinkRows(container, onEditDrink, onGestureDrink) {
  container.querySelectorAll('.log-entry-drink').forEach(row => {
    const index = Number(row.dataset.index);

    let startX = 0, startY = 0;
    let axisLocked = null;   // 'x' | 'y' | null
    let didDrag = false;
    let activePointerId = null;

    function reset() {
      axisLocked = null;
      didDrag = false;
      activePointerId = null;
      row.classList.remove('log-entry-dragging', 'log-entry-drag-x', 'log-entry-drag-y');
    }

    row.addEventListener('pointerdown', e => {
      if (e.target.closest('.log-action-btn')) return;
      startX = e.clientX;
      startY = e.clientY;
      axisLocked = null;
      didDrag = false;
      activePointerId = e.pointerId;
      row.setPointerCapture(e.pointerId);
    });

    row.addEventListener('pointermove', e => {
      if (activePointerId !== e.pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!axisLocked && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        axisLocked = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        didDrag = true;
        row.classList.add('log-entry-dragging',
          axisLocked === 'x' ? 'log-entry-drag-x' : 'log-entry-drag-y');
      }

      if (axisLocked) {
        e.preventDefault(); // prevent scroll while gesture is active
        const dtTime = axisLocked === 'x' ? Math.round(dx / PX_PER_MIN) : 0;
        const dtDur  = axisLocked === 'y' ? -Math.round(dy / PX_PER_MIN) : 0;
        _updateDrinkRowFeedback(row, dtTime, dtDur);
      }
    });

    row.addEventListener('pointerup', e => {
      if (activePointerId !== e.pointerId) return;
      if (didDrag && axisLocked) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const dtTime = axisLocked === 'x' ? Math.round(dx / PX_PER_MIN) : 0;
        const dtDur  = axisLocked === 'y' ? -Math.round(dy / PX_PER_MIN) : 0;
        if (onGestureDrink) onGestureDrink(index, dtTime, dtDur);
      } else if (!didDrag) {
        // Tap: open edit panel
        onEditDrink(index);
      }
      reset();
    });

    row.addEventListener('pointercancel', e => {
      if (activePointerId !== e.pointerId) return;
      // Restore original display values
      _updateDrinkRowFeedback(row, 0, 0);
      reset();
    });

    // Keyboard: Enter/Space opens edit
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEditDrink(index); }
    });
  });
}

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
 * Update the time label and meta text of a drink row during a drag gesture
 * to give live visual feedback.  Uses data-* attributes stored on the row.
 *
 * @param {HTMLElement} row
 * @param {number} dtTime — delta minutes for time_min (may be 0)
 * @param {number} dtDur  — delta minutes for duration_min (may be 0)
 */
function _updateDrinkRowFeedback(row, dtTime, dtDur) {
  const origTime = Number(row.dataset.origTimeMins);
  const origDur  = Number(row.dataset.origDurationMins);

  // origTime may be normalized (> 1440 for after-midnight drinks);
  // reduce to clock-minutes before applying the delta so clamping is correct.
  const clockTime = origTime % 1440;
  const newTime = Math.min(1439, Math.max(0, clockTime + dtTime));
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
