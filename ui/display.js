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
 */
export function renderSessionLog(drinks, food_events, presets, onDeleteDrink, onDeleteFood, onEditDrink, onEditFood) {
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
      const meta = [
        `${d.volume_ml} mL`,
        `${d.abv_pct} % ABV`,
        d.duration_min ? `${d.duration_min} min` : null,
        d.carbonated  ? 'carbonated' : null,
        d.with_food   ? 'with food'  : null,
      ].filter(Boolean).join(' · ');

      return `<div class="log-entry log-entry-drink" data-kind="drink" data-index="${ev.index}"
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

  // Clicking anywhere on the entry row opens the edit panel;
  // clicks on the delete button are handled by the button itself.
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
  _bindRowEdit('.log-entry-drink', onEditDrink);
  _bindRowEdit('.log-entry-food',  onEditFood);

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
