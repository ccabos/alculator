/**
 * Alculator — Form & Panel Management
 * @module ui/form
 *
 * Manages the three entry panels (drink, food, profile) and the preset grid.
 * Calls back into the session store and preset store; dispatches
 * alculator:session-changed after each save.
 */

import { DURATION_QUICK_SELECT_MIN } from '../model/constants.js';
import { saveSession }               from '../store/session.js';

// ─── Panel helpers ─────────────────────────────────────────────────────────────

/**
 * Open a named panel (show backdrop, remove hidden attribute).
 * @param {string} panelId
 */
export function openPanel(panelId) {
  const panel    = document.getElementById(panelId);
  const backdrop = document.getElementById('panel-backdrop');
  if (!panel) return;
  panel.hidden    = false;
  backdrop.hidden = false;
  // Move focus to first focusable element
  const first = panel.querySelector('button, input, select');
  first?.focus();
}

/**
 * Close a named panel.
 * @param {string} panelId
 */
export function closePanel(panelId) {
  const panel    = document.getElementById(panelId);
  const backdrop = document.getElementById('panel-backdrop');
  if (panel) panel.hidden = true;
  // Hide backdrop only when no panels are open
  const anyOpen = document.querySelectorAll('.panel:not([hidden])').length > 0;
  if (!anyOpen) backdrop.hidden = true;
}

// ─── Preset grid ───────────────────────────────────────────────────────────────

/**
 * Render the preset grid inside the drink panel.
 * @param {object[]} presets
 * @param {Function} onSelect — callback(preset)
 */
export function renderPresetGrid(presets, onSelect) {
  const grid = document.getElementById('preset-grid');
  grid.innerHTML = presets.map(p => `
    <button class="preset-btn" data-preset-id="${p.id}" role="listitem"
            aria-label="${p.name}, ${p.volume_ml} mL, ${p.abv_pct}% ABV">
      <span class="preset-btn-name">${esc(p.name)}</span>
      <span class="preset-btn-meta">${p.volume_ml} mL · ${p.abv_pct}%</span>
    </button>
  `).join('');

  grid.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = presets.find(p => p.id === btn.dataset.presetId);
      if (preset) onSelect(preset);
    });
  });
}

// ─── Duration quick-select ─────────────────────────────────────────────────────

/**
 * Render the drinking-duration quick-select buttons.
 * Syncs selection with the numeric input.
 */
export function renderDurationQuickSelect() {
  const container  = document.getElementById('duration-quick');
  const durationIn = document.getElementById('drink-duration');

  container.innerHTML = DURATION_QUICK_SELECT_MIN.map(d =>
    `<button type="button" class="quick-btn" data-val="${d}">${d} min</button>`
  ).join('');

  container.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      durationIn.value = btn.dataset.val;
    });
  });

  // Keep quick-select in sync when user types manually
  durationIn.addEventListener('input', () => {
    container.querySelectorAll('.quick-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.val === durationIn.value);
    });
  });
}

// ─── Drink panel ───────────────────────────────────────────────────────────────

/**
 * Initialise the drink panel: render presets, wire up the custom-form toggle,
 * and handle save.
 *
 * @param {object[]}  presets
 * @param {Function}  getSession  — () => current session
 * @param {Function}  setSession  — (session) => void
 */
export function initDrinkPanel(presets, getSession, setSession) {
  renderPresetGrid(presets, preset => {
    // Log preset with defaults; close panel immediately
    _saveDrink({
      preset_id:    preset.id,
      volume_ml:    preset.volume_ml,
      abv_pct:      preset.abv_pct,
      carbonated:   preset.carbonated,
      with_food:    false,
      duration_min: preset.duration_min,
    }, getSession, setSession);
    closePanel('drink-panel');
  });

  renderDurationQuickSelect();

  // Toggle custom form
  const customBtn     = document.getElementById('drink-custom-btn');
  const customForm    = document.getElementById('drink-custom-form');
  const presetGrid    = document.getElementById('preset-grid');
  const cancelBtn     = document.getElementById('drink-custom-cancel');

  customBtn.addEventListener('click', () => {
    customForm.hidden = false;
    presetGrid.hidden = true;
    customBtn.hidden  = true;
    _setDefaultTime('drink-time');
  });
  cancelBtn.addEventListener('click', () => {
    customForm.hidden = true;
    presetGrid.hidden = false;
    customBtn.hidden  = false;
  });

  // Save custom drink
  document.getElementById('drink-custom-save').addEventListener('click', () => {
    const volume    = parseFloat(document.getElementById('drink-volume').value);
    const abv       = parseFloat(document.getElementById('drink-abv').value);
    const duration  = parseInt(document.getElementById('drink-duration').value, 10) || 0;
    const carbonated = document.getElementById('drink-carbonated').checked;
    const with_food  = document.getElementById('drink-with-food').checked;
    const timeVal    = document.getElementById('drink-time').value;

    if (!volume || !abv || isNaN(volume) || isNaN(abv)) {
      alert('Please enter a valid volume and ABV.');
      return;
    }

    _saveDrink({
      volume_ml:    volume,
      abv_pct:      abv,
      carbonated,
      with_food,
      duration_min: duration,
      time_min:     _timeToMin(timeVal),
    }, getSession, setSession);
    closePanel('drink-panel');
  });
}

// ─── Food panel ────────────────────────────────────────────────────────────────

/**
 * Initialise the food panel.
 * @param {Function} getSession
 * @param {Function} setSession
 */
export function initFoodPanel(getSession, setSession) {
  _setDefaultTime('food-time');

  let selectedMeal = null;

  document.querySelectorAll('.meal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.meal-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedMeal = btn.dataset.meal;
    });
  });

  document.getElementById('food-save').addEventListener('click', () => {
    if (!selectedMeal) { alert('Select a meal size.'); return; }
    const timeVal = document.getElementById('food-time').value;
    const note    = document.getElementById('food-note').value.trim();

    const session = getSession();
    const updated = {
      ...session,
      food_events: [
        ...session.food_events,
        { time_min: _timeToMin(timeVal), type: selectedMeal, ...(note ? { note } : {}) },
      ],
    };
    setSession(updated);
    saveSession(updated);
    closePanel('food-panel');
  });
}

// ─── Profile panel ─────────────────────────────────────────────────────────────

/**
 * Initialise the profile panel.
 * @param {Function} getSession
 * @param {Function} setSession
 */
export function initProfilePanel(getSession, setSession) {
  document.getElementById('profile-save').addEventListener('click', () => {
    const sex    = document.getElementById('profile-sex').value;
    const weight = parseFloat(document.getElementById('profile-weight').value);
    const age    = parseInt(document.getElementById('profile-age').value, 10);
    const height = parseFloat(document.getElementById('profile-height').value) || null;

    if (!sex || !weight || !age) {
      alert('Please fill in sex, weight, and age.');
      return;
    }

    const profile = { sex, weight_kg: weight, age, ...(height ? { height_cm: height } : {}) };
    const session = getSession();
    const updated = { ...session, profile };
    setSession(updated);
    saveSession(updated);
    closePanel('profile-panel');
  });

  // Age warning
  document.getElementById('profile-age').addEventListener('input', e => {
    const warning = document.getElementById('profile-age-warning');
    warning.hidden = !(parseInt(e.target.value, 10) < 18);
  });
}

/**
 * Populate profile panel inputs from stored profile.
 * @param {object|null} profile
 */
export function populateProfilePanel(profile) {
  if (!profile) return;
  if (profile.sex)       document.getElementById('profile-sex').value    = profile.sex;
  if (profile.weight_kg) document.getElementById('profile-weight').value = profile.weight_kg;
  if (profile.age)       document.getElementById('profile-age').value    = profile.age;
  if (profile.height_cm) document.getElementById('profile-height').value = profile.height_cm;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function _saveDrink(drinkData, getSession, setSession) {
  const now = drinkData.time_min ?? _nowMin();
  const drink = { time_min: now, ...drinkData };
  const session = getSession();
  const updated = { ...session, drinks: [...session.drinks, drink] };
  setSession(updated);
  saveSession(updated);
}

/** Current time in minutes from midnight. */
function _nowMin() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Set a time input's value to the current time. */
function _setDefaultTime(inputId) {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  document.getElementById(inputId).value = `${hh}:${mm}`;
}

/** Parse HH:MM string to minutes from midnight. */
function _timeToMin(timeStr) {
  if (!timeStr) return _nowMin();
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Escape HTML entities. */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
