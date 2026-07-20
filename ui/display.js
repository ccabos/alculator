/**
 * Alculator — Display / Readout Rendering
 * @module ui/display
 *
 * Renders the BAC numeric readout, safety badge, sober-time indicator,
 * and the session log.  All functions accept data and write directly to the DOM.
 * No side effects beyond DOM mutation.
 */

import { BAC_THRESHOLDS } from '../model/constants.js';
import { drinkDurationMin } from '../model/absorption.js';

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
    rangeEl.innerHTML = `<span>▲ ${(bounds.upper * 10).toFixed(2)}</span><span>▼ ${(bounds.lower * 10).toFixed(2)}</span>`;
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
 * @param {Function} [onFieldLive]   — callback(index, field, value): live preview
 *   while sliding a drink field button (field: 'volume'|'abv'|'start'|'end')
 * @param {Function} [onFieldCommit] — callback(index, field, value): commit a slid value
 * @param {Function} [onSetDrinkTimeNow] — callback(index, field): double-tap a
 *   drink's start/end button to set that time to now
 * @param {Function} [onGestureFood]  — callback(index, deltaTimeMins)
 * @param {Function} [onFoodChartUpdate] — callback(index, deltaTimeMins)
 */
export function renderSessionLog(
  drinks, food_events, presets,
  onDeleteDrink, onDeleteFood,
  onEditDrink,   onEditFood,
  onFieldLive,   onFieldCommit, onSetDrinkTimeNow,
  onGestureFood, onFoodChartUpdate,
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
      const dur    = drinkDurationMin(d);
      const endMin = wrapTime(d.time_min + dur);
      const tags   = [
        d.carbonated ? '<span class="log-tag">carbonated</span>' : '',
        d.with_food  ? '<span class="log-tag">with food</span>'  : '',
      ].join('');

      return `<div class="log-entry log-entry-drink" data-kind="drink" data-index="${ev.index}"
              data-vol="${d.volume_ml}" data-abv="${d.abv_pct}"
              data-start="${d.time_min}" data-dur="${dur}">
        <div class="log-entry-head" role="button" tabindex="0" aria-label="Edit ${esc(name)}">
          <span class="log-entry-icon" aria-hidden="true">${drinkIcon(d.preset_id)}</span>
          <div class="log-entry-name">${esc(name)}${tags}</div>
          <div class="log-entry-actions">
            <button class="log-action-btn delete-drink-btn" data-index="${ev.index}"
                    aria-label="Delete drink">✕</button>
          </div>
        </div>
        <div class="log-fields">
          <button type="button" class="log-field-btn" data-field="volume"
                  aria-label="Volume ${d.volume_ml} mL; slide up or down to change">
            <span class="field-label">Vol</span><span class="field-value">${d.volume_ml} mL</span></button>
          <button type="button" class="log-field-btn" data-field="abv"
                  aria-label="Alcohol content ${_fmtAbv(d.abv_pct)} percent; slide up or down to change">
            <span class="field-label">ABV</span><span class="field-value">${_fmtAbv(d.abv_pct)} %</span></button>
          <button type="button" class="log-field-btn" data-field="start"
                  aria-label="Start time ${fmtTime(d.time_min)}; double-tap for now, slide to change">
            <span class="field-label">Start</span><span class="field-value">${fmtTime(d.time_min)}</span></button>
          <button type="button" class="log-field-btn" data-field="end"
                  aria-label="Finish time ${fmtTime(endMin)}; double-tap for now, slide to change">
            <span class="field-label">End</span><span class="field-value">${fmtTime(endMin)}</span></button>
        </div>
      </div>`;
    } else {
      const f = ev.data;
      const label = MEAL_LABELS[f.type] ?? f.type;
      return `<div class="log-entry log-entry-food" data-kind="food" data-index="${ev.index}"
              data-orig-time-min="${f.time_min}"
              role="button" tabindex="0" aria-label="Edit ${esc(label)}">
        <span class="log-drag-hint" aria-hidden="true">⠿</span>
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

  // Drink rows — the header opens the editor; each field button is adjustable by
  // a hold-and-slide, and the time buttons accept a double-tap to set "now".
  container.querySelectorAll('.log-entry-drink').forEach(row => {
    const index = Number(row.dataset.index);
    const head  = row.querySelector('.log-entry-head');
    head.addEventListener('click', e => {
      if (e.target.closest('.log-action-btn')) return;
      onEditDrink(index);
    });
    head.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEditDrink(index); }
    });
    row.querySelectorAll('.log-field-btn').forEach(btn => {
      const field = btn.dataset.field;
      _bindFieldSlider(btn, field, {
        onLive:      (f, v) => onFieldLive?.(index, f, v),
        onCommit:    (f, v) => onFieldCommit?.(index, f, v),
        onDoubleTap: (field === 'start' || field === 'end')
          ? (f) => onSetDrinkTimeNow?.(index, f)
          : null,
      });
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

  // Delete buttons — two-tap confirmation
  function _bindDeleteBtn(btn, onDelete) {
    let timer = null;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.dataset.confirm === '1') {
        clearTimeout(timer);
        onDelete(Number(btn.dataset.index));
      } else {
        btn.dataset.confirm = '1';
        btn.classList.add('delete-btn-confirm');
        btn.textContent = '✓';
        btn.setAttribute('aria-label', btn.getAttribute('aria-label').replace('Delete', 'Confirm delete'));
        timer = setTimeout(() => {
          btn.dataset.confirm = '';
          btn.classList.remove('delete-btn-confirm');
          btn.textContent = '✕';
          btn.setAttribute('aria-label', btn.getAttribute('aria-label').replace('Confirm delete', 'Delete'));
        }, 2000);
      }
    });
  }
  container.querySelectorAll('.delete-drink-btn').forEach(btn => _bindDeleteBtn(btn, onDeleteDrink));
  container.querySelectorAll('.delete-food-btn').forEach(btn => _bindDeleteBtn(btn, onDeleteFood));
}

// ─── Gesture value overlay ────────────────────────────────────────────────────

function _showGestureOverlay(text) {
  const el = document.getElementById('gesture-overlay');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
}

function _hideGestureOverlay() {
  const el = document.getElementById('gesture-overlay');
  if (el) el.hidden = true;
}

// ─── Shared gesture handler ────────────────────────────────────────────────────

/** ms the pointer must be held still before drag mode activates. */
const LONG_PRESS_MS    = 300;
/** px of horizontal movement before the hold that cancels the long-press. */
const ABORT_THRESHOLD  = 10;
/** px of vertical movement before the hold that enters scroll mode.
 *  Kept small to minimise the frozen dead-zone while touch-action:none is
 *  active; full accumulated movement is compensated on scroll-mode entry. */
const SCROLL_THRESHOLD = 4;
/** px of drag travel after activation that equals 1 minute of change. */
const PX_PER_MIN       = 3;
/** px of movement after activation before the axis is locked. */
const DRAG_THRESHOLD   = 8;
/** ms window within which a second tap counts as a double-tap. When a row has a
 *  double-tap action, the single-tap (edit) is deferred by this long to tell
 *  the two apart. */
const DOUBLE_TAP_MS    = 250;

/**
 * Bind a unified long-press + drag gesture to a single log-entry row.
 *
 * Interaction model:
 *   • Short tap (< LONG_PRESS_MS, < ABORT_THRESHOLD movement) → onTap()
 *   • Double tap (two taps within DOUBLE_TAP_MS) → onDoubleTap(), if provided;
 *     when a double-tap action exists, onTap is deferred by DOUBLE_TAP_MS so the
 *     two can be told apart
 *   • Vertical swipe before hold completes → scrolls #main (the real overflow container)
 *   • Horizontal swipe before hold completes → cancels long-press (no gesture, no tap)
 *   • Hold LONG_PRESS_MS without moving → gesture activates (haptic + visual)
 *   • Horizontal drag after activation → onGesture(dtTime, 0), live onChartLive
 *   • Vertical drag after activation (allowVertical) → onGesture(0, dtDur), live onChartLive
 *
 * CSS sets touch-action:none on the rows so the browser never intercepts touch
 * events.  Page scrolling is driven manually via #session-log.scrollBy() when
 * vertical movement is detected before the long-press timer fires.  This is the
 * only approach that lets us support both native-feeling page scroll AND vertical
 * duration drag — dynamic touch-action changes mid-gesture are ignored by browsers.
 *
 * @param {HTMLElement} row
 * @param {{ allowVertical: boolean, onTap: Function, onGesture: Function,
 *           onChartLive: Function, updateFeedback: Function, onDoubleTap?: Function }} config
 */
function _bindGestureRow(row, { allowVertical, onTap, onGesture, onChartLive, updateFeedback, onDoubleTap }) {
  // Double-tap arbitration state (only used when onDoubleTap is provided).
  let singleTapTimer = null;
  let lastTapAt      = 0;
  const clearPendingTap = () => {
    if (singleTapTimer !== null) { clearTimeout(singleTapTimer); singleTapTimer = null; }
    lastTapAt = 0;
  };
  const handleTap = () => {
    if (!onDoubleTap) { onTap?.(); return; }  // no double-tap action → open edit immediately
    const now = Date.now();
    if (singleTapTimer !== null && now - lastTapAt < DOUBLE_TAP_MS) {
      clearPendingTap();
      onDoubleTap();
    } else {
      lastTapAt = now;
      singleTapTimer = setTimeout(() => { singleTapTimer = null; onTap?.(); }, DOUBLE_TAP_MS);
    }
  };
  let startX = 0, startY = 0;
  let axisLocked      = null;
  let didDrag         = false;
  let activePointerId = null;
  let gestureReady    = false;
  let longPressTimer  = null;
  let lastDtTime      = 0;
  let lastDtDur       = 0;
  let scrollMode      = false;  // true when pre-hold vertical swipe detected
  let lastScrollY     = 0;      // tracks incremental scroll steps
  let currentY        = 0;      // latest pointer Y for activateGesture guard

  const activateGesture = () => {
    if (activePointerId == null || scrollMode) return;
    // Bail if the pointer has drifted vertically — user is likely scrolling and
    // the timer fired before SCROLL_THRESHOLD was reached.  Prevents the
    // log-entry-held highlight from flickering on during a slow scroll.
    if (Math.abs(currentY - startY) > 1) return;
    gestureReady = true;
    row.setPointerCapture(activePointerId);
    row.classList.add('log-entry-held');
    navigator.vibrate?.(15);
    // Show overlay with the row's current values (before any drag).
    // Drinks (with a duration) show the start–finish range; food rows show the time.
    const start   = wrapTime(Number(row.dataset.origTimeMin) % 1440);
    const durAttr = row.dataset.origDurationMin;
    const dur     = durAttr != null ? Number(durAttr) : 0;
    _showGestureOverlay(dur > 0 ? `${fmtTime(start)}–${fmtTime(wrapTime(start + dur))}` : fmtTime(start));
  };

  const reset = () => {
    clearTimeout(longPressTimer);
    longPressTimer  = null;
    axisLocked      = null;
    didDrag         = false;
    activePointerId = null;
    gestureReady    = false;
    lastDtTime      = 0;
    lastDtDur       = 0;
    scrollMode      = false;
    lastScrollY     = 0;
    currentY        = 0;
    row.classList.remove('log-entry-held', 'log-entry-dragging', 'log-entry-drag-x', 'log-entry-drag-y');
    _hideGestureOverlay();
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
    scrollMode      = false;
    lastScrollY     = e.clientY;
    currentY        = e.clientY;
    activePointerId = e.pointerId;
    longPressTimer  = setTimeout(activateGesture, LONG_PRESS_MS);
  });

  row.addEventListener('pointermove', e => {
    if (activePointerId !== e.pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!gestureReady) {
      currentY = e.clientY;
      const stepY = e.clientY - lastScrollY;
      lastScrollY = e.clientY;

      if (scrollMode) {
        document.getElementById('session-log').scrollBy(0, -stepY);
        return;
      }

      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      if (ady > SCROLL_THRESHOLD && ady > adx) {
        // Vertical intent → enter scroll mode and compensate for the entire
        // frozen period (not just the last step) to eliminate the dead-zone jump.
        clearTimeout(longPressTimer);
        longPressTimer = null;
        scrollMode = true;
        document.getElementById('session-log').scrollBy(0, -dy);
        return;
      }
      if (adx > ABORT_THRESHOLD) {
        // Horizontal movement → cancel long-press (not a tap, not a gesture)
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
      e.preventDefault();
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
    const wasReady  = gestureReady;
    const wasDrag   = didDrag && axisLocked;
    const wasScroll = scrollMode;
    const finalDx   = e.clientX - startX;
    const finalDy   = e.clientY - startY;
    const finalAxis = axisLocked;
    reset();

    if (wasReady && wasDrag) {
      clearPendingTap(); // a drag is not a tap — discard any pending single-tap
      const dtTime = finalAxis === 'x' ? Math.round(finalDx / PX_PER_MIN) : 0;
      const dtDur  = finalAxis === 'y' ? -Math.round(finalDy / PX_PER_MIN) : 0;
      onGesture?.(dtTime, dtDur);
    } else if (!wasScroll) {
      // Short tap or hold-without-drag: open edit (or, on a second quick tap, run
      // the double-tap action).
      handleTap();
    }
  });

  row.addEventListener('pointercancel', e => {
    if (activePointerId !== e.pointerId) return;
    if (gestureReady) {
      updateFeedback(row, 0, 0);
      if (onChartLive) onChartLive(0, 0);
    }
    reset();
  });

  row.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap?.(); }
  });
}

// ─── Row feedback helpers ──────────────────────────────────────────────────────

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
  if (dtTime !== 0) _showGestureOverlay(fmtTime(newTime));
}

// ─── Field-button slider ───────────────────────────────────────────────────────

/** Largest drinking-window (minutes) reachable by sliding a start/end button. */
const MAX_FIELD_DUR = 360;

/** Format an ABV so whole numbers show without a decimal (12 %, not 12.0 %). */
function _fmtAbv(v) {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

const FIELD_LABEL = { volume: 'Volume', abv: 'ABV', start: 'Start', end: 'End' };

/**
 * Convert a vertical slide distance (px) to a signed, up-positive step count.
 *
 * Steps are counted only *beyond* DRAG_THRESHOLD, giving a symmetric dead-zone
 * around the origin: a small residual offset at release commits zero steps
 * rather than nudging the value. Without this, recognising a drag at 8px but
 * then dividing the raw distance meant a near-motionless release could still
 * drift a field by one step (e.g. 200 mL → 195 mL).
 *
 * @param {number} dy — pointer travel; negative is up (increase).
 * @returns {number}  — steps, positive for upward slides.
 */
function _slideSteps(dy) {
  const mag = Math.abs(dy);
  if (mag <= DRAG_THRESHOLD) return 0;
  return -Math.sign(dy) * Math.round((mag - DRAG_THRESHOLD) / PX_PER_MIN);
}

/**
 * Compute the new value + display text for a field-button slide.
 *
 * @param {string} field  — 'volume' | 'abv' | 'start' | 'end'
 * @param {{ vol:number, abv:number, start:number, dur:number }} base — values at slide start
 * @param {number} units  — up-positive slide steps (one per PX_PER_MIN px)
 * @returns {{ value:number, display:string }}
 */
function _fieldValueFor(field, base, units) {
  if (field === 'volume') {
    const v = Math.min(2000, Math.max(10, base.vol + units * 5));
    return { value: v, display: `${v} mL` };
  }
  if (field === 'abv') {
    const v = Math.min(100, Math.max(0, Math.round((base.abv + units * 0.5) * 2) / 2));
    return { value: v, display: `${_fmtAbv(v)} %` };
  }
  if (field === 'start') {
    // Move the start; keep the finish. Keep the window within [0, MAX_FIELD_DUR].
    const endLin = base.start + base.dur;
    const s = Math.round(Math.min(endLin, Math.max(endLin - MAX_FIELD_DUR, base.start + units)));
    return { value: wrapTime(s), display: fmtTime(wrapTime(s)) };
  }
  // end: move the finish; keep the start.
  const e = Math.round(Math.min(base.start + MAX_FIELD_DUR, Math.max(base.start, base.start + base.dur + units)));
  return { value: wrapTime(e), display: fmtTime(wrapTime(e)) };
}

/**
 * Bind a hold-and-slide gesture to one drink field button.
 *
 * Interaction mirrors the log rows: a quick vertical swipe scrolls the log; a
 * long-press then a vertical slide adjusts the field's value (shown live in the
 * button and in the top-of-screen overlay); release commits. Time buttons also
 * accept a double-tap (via onDoubleTap) to set the value to now. A committed
 * slide is not a tap, and horizontal movement before the hold cancels it.
 *
 * @param {HTMLElement} btn
 * @param {string} field
 * @param {{ onLive?: Function, onCommit?: Function, onDoubleTap?: Function|null }} cbs
 */
function _bindFieldSlider(btn, field, { onLive, onCommit, onDoubleTap }) {
  let startX = 0, startY = 0, activePointerId = null, gestureReady = false;
  let longPressTimer = null, scrollMode = false, lastScrollY = 0, currentY = 0;
  let didDrag = false, base = null;
  let singleTapTimer = null, lastTapAt = 0;
  const valueEl = btn.querySelector('.field-value');

  const readBase = () => {
    const row = btn.closest('.log-entry-drink');
    return {
      vol:   Number(row.dataset.vol),
      abv:   Number(row.dataset.abv),
      start: Number(row.dataset.start),
      dur:   Number(row.dataset.dur),
    };
  };

  const activate = () => {
    if (activePointerId == null || scrollMode) return;
    if (Math.abs(currentY - startY) > 1) return; // drifted → probably scrolling
    gestureReady = true;
    btn.setPointerCapture(activePointerId);
    btn.classList.add('log-field-active');
    navigator.vibrate?.(15);
    base = readBase();
    _showGestureOverlay(`${FIELD_LABEL[field]}  ${_fieldValueFor(field, base, 0).display}`);
  };

  const reset = () => {
    clearTimeout(longPressTimer); longPressTimer = null;
    activePointerId = null; gestureReady = false; scrollMode = false;
    didDrag = false; currentY = 0;
    btn.classList.remove('log-field-active');
    _hideGestureOverlay();
  };

  btn.addEventListener('pointerdown', e => {
    startX = e.clientX; startY = e.clientY; currentY = e.clientY; lastScrollY = e.clientY;
    activePointerId = e.pointerId; gestureReady = false; scrollMode = false; didDrag = false;
    longPressTimer = setTimeout(activate, LONG_PRESS_MS);
  });

  btn.addEventListener('pointermove', e => {
    if (activePointerId !== e.pointerId) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;

    if (!gestureReady) {
      currentY = e.clientY;
      const stepY = e.clientY - lastScrollY; lastScrollY = e.clientY;
      if (scrollMode) { document.getElementById('session-log').scrollBy(0, -stepY); return; }
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (ady > SCROLL_THRESHOLD && ady >= adx) {
        clearTimeout(longPressTimer); longPressTimer = null; scrollMode = true;
        document.getElementById('session-log').scrollBy(0, -dy);
        return;
      }
      if (adx > ABORT_THRESHOLD) { clearTimeout(longPressTimer); longPressTimer = null; activePointerId = null; }
      return;
    }

    e.preventDefault();
    if (Math.abs(dy) > DRAG_THRESHOLD) didDrag = true;
    const units = _slideSteps(dy);
    const { value, display } = _fieldValueFor(field, base, units);
    if (valueEl) valueEl.textContent = display;
    _showGestureOverlay(`${FIELD_LABEL[field]}  ${display}`);
    onLive?.(field, value);
  });

  btn.addEventListener('pointerup', e => {
    if (activePointerId !== e.pointerId) return;
    const wasReady = gestureReady, wasDrag = didDrag, wasScroll = scrollMode;
    const finalDy = e.clientY - startY;
    const b = base;
    reset();
    if (wasReady && wasDrag && b) {
      const units = _slideSteps(finalDy);
      onCommit?.(field, _fieldValueFor(field, b, units).value);
    } else if (!wasReady && !wasScroll) {
      handleTap();
    }
  });

  btn.addEventListener('pointercancel', e => {
    if (activePointerId !== e.pointerId) return;
    if (gestureReady && base) onLive?.(field, _fieldValueFor(field, base, 0).value); // revert preview
    reset();
  });

  function handleTap() {
    if (!onDoubleTap) return; // volume/abv buttons have no tap action
    const now = Date.now();
    if (singleTapTimer !== null && now - lastTapAt < DOUBLE_TAP_MS) {
      clearTimeout(singleTapTimer); singleTapTimer = null; lastTapAt = 0;
      onDoubleTap(field);
    } else {
      lastTapAt = now;
      singleTapTimer = setTimeout(() => { singleTapTimer = null; }, DOUBLE_TAP_MS);
    }
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
