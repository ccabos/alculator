/**
 * Alculator — Form & Panel Management
 * @module ui/form
 *
 * Manages the three entry panels (drink, food, profile) and the preset grid.
 * Calls back into the session store and preset store; dispatches
 * alculator:session-changed after each save.
 */

import { DURATION_QUICK_SELECT_MIN, DEFAULT_DRINK_PRESETS } from '../model/constants.js';
import { loadPresets, savePreset, deletePreset, resetPresets } from '../store/presets.js';

const BEER_PRESET_IDS = new Set(['beer_regular', 'beer_pint']);
import { saveSession } from '../store/session.js';

// ─── Module state ──────────────────────────────────────────────────────────────
let _editingDrinkIndex    = null;
let _editingDrinkPresetId = null;
let _editingFoodIndex     = null;
let _selectedMeal         = null;
let _presetSelectCallback = null; // kept so refreshPresetGrid can re-render

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
  _presetSelectCallback = preset => {
    _saveDrink({
      preset_id:    preset.id,
      volume_ml:    preset.volume_ml,
      abv_pct:      preset.abv_pct,
      carbonated:   preset.carbonated,
      with_food:    false,
      duration_min: preset.duration_min,
    }, getSession, setSession);
    closePanel('drink-panel');
  };
  renderPresetGrid(presets, _presetSelectCallback);

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
    _editingDrinkIndex    = null;
    _editingDrinkPresetId = null;
    customForm.hidden = true;
    presetGrid.hidden = false;
    customBtn.hidden  = false;
    document.getElementById('drink-carbonated').closest('label').hidden = false;
    document.querySelector('#drink-panel .panel-header h2').textContent = 'Add Drink';
    document.getElementById('drink-custom-save').textContent = 'Log Drink';
  });

  // Save custom drink (handles both add and edit)
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

    const editIdx    = _editingDrinkIndex;
    const presetId   = _editingDrinkPresetId;
    _editingDrinkIndex    = null;
    _editingDrinkPresetId = null;
    document.querySelector('#drink-panel .panel-header h2').textContent = 'Add Drink';
    document.getElementById('drink-custom-save').textContent = 'Log Drink';

    _saveDrink({
      ...(presetId ? { preset_id: presetId } : {}),
      volume_ml:    volume,
      abv_pct:      abv,
      carbonated,
      with_food,
      duration_min: duration,
      time_min:     _timeToMin(timeVal),
    }, getSession, setSession, editIdx);
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
  document.querySelectorAll('.meal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.meal-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      _selectedMeal = btn.dataset.meal;
    });
  });

  document.getElementById('food-save').addEventListener('click', () => {
    if (!_selectedMeal) { alert('Select a meal size.'); return; }
    const timeVal = document.getElementById('food-time').value;
    const note    = document.getElementById('food-note').value.trim();
    const foodEntry = { time_min: _timeToMin(timeVal), type: _selectedMeal, ...(note ? { note } : {}) };

    const session = getSession();
    let updated;
    if (_editingFoodIndex !== null) {
      const food_events = session.food_events.map((f, i) => i === _editingFoodIndex ? foodEntry : f);
      updated = { ...session, food_events };
      _editingFoodIndex = null;
      document.querySelector('#food-panel .panel-header h2').textContent = 'Log Food';
      document.getElementById('food-save').textContent = 'Log Food';
    } else {
      updated = { ...session, food_events: [...session.food_events, foodEntry] };
    }
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

    if (!sex || !weight) {
      alert('Please fill in sex and weight.');
      return;
    }

    const profile = { sex, weight_kg: weight, ...(age ? { age } : {}), ...(height ? { height_cm: height } : {}) };
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

// ─── Edit-mode openers ─────────────────────────────────────────────────────────

/**
 * Open the drink panel pre-filled for editing an existing entry.
 * @param {object} drink   — the drink object to edit
 * @param {number} index   — its index in session.drinks
 */
export function openDrinkPanelForEdit(drink, index) {
  _editingDrinkIndex    = index;
  _editingDrinkPresetId = drink.preset_id ?? null;

  // Show custom form, hide preset grid
  document.getElementById('drink-custom-form').hidden = false;
  document.getElementById('preset-grid').hidden        = true;
  document.getElementById('drink-custom-btn').hidden   = true;

  // Pre-fill fields
  document.getElementById('drink-volume').value     = drink.volume_ml;
  document.getElementById('drink-abv').value        = drink.abv_pct;
  document.getElementById('drink-duration').value   = drink.duration_min ?? 0;
  document.getElementById('drink-carbonated').checked = !!drink.carbonated;
  document.getElementById('drink-with-food').checked  = !!drink.with_food;

  // Hide carbonated option for beer presets (carbonation is fixed)
  document.getElementById('drink-carbonated').closest('label').hidden =
    BEER_PRESET_IDS.has(drink.preset_id);
  document.getElementById('drink-time').value       = _minToTime(drink.time_min);

  // Sync duration quick-select buttons
  document.querySelectorAll('#duration-quick .quick-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.val === String(drink.duration_min ?? 0));
  });

  // Update panel title and save button
  document.querySelector('#drink-panel .panel-header h2').textContent = 'Edit Drink';
  document.getElementById('drink-custom-save').textContent = 'Save Changes';

  openPanel('drink-panel');
}

/**
 * Open the food panel pre-filled for editing an existing entry.
 * @param {object} food    — the food_event object to edit
 * @param {number} index   — its index in session.food_events
 */
export function openFoodPanelForEdit(food, index) {
  _editingFoodIndex = index;
  _selectedMeal     = food.type;

  // Pre-select the matching meal button
  document.querySelectorAll('.meal-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.meal === food.type);
  });

  // Pre-fill time and note
  document.getElementById('food-time').value = _minToTime(food.time_min);
  document.getElementById('food-note').value = food.note ?? '';

  // Update panel title and save button
  document.querySelector('#food-panel .panel-header h2').textContent = 'Edit Food';
  document.getElementById('food-save').textContent = 'Save Changes';

  openPanel('food-panel');
}

/**
 * Reset the food panel to "Add" mode (call before opening it normally).
 */
export function resetFoodPanel() {
  _editingFoodIndex = null;
  _selectedMeal     = null;
  document.querySelectorAll('.meal-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('food-note').value = '';
  _setDefaultTime('food-time');
}

/**
 * Reset the drink panel to "Add" mode (call before opening it normally).
 */
export function resetDrinkPanel() {
  _editingDrinkIndex    = null;
  _editingDrinkPresetId = null;
  document.getElementById('drink-custom-form').hidden = true;
  document.getElementById('preset-grid').hidden        = false;
  document.getElementById('drink-custom-btn').hidden   = false;
  document.getElementById('drink-carbonated').closest('label').hidden = false;
  document.querySelector('#drink-panel .panel-header h2').textContent = 'Add Drink';
  document.getElementById('drink-custom-save').textContent = 'Log Drink';
}

// ─── Preset manager ────────────────────────────────────────────────────────────

/**
 * Re-render the preset grid in the drink panel (call after preset changes).
 * @param {object[]} presets
 */
export function refreshPresetGrid(presets) {
  if (_presetSelectCallback) renderPresetGrid(presets, _presetSelectCallback);
}

/**
 * Initialise the preset manager panel.
 *
 * @param {Function} onChanged — called after any save / delete / reset so
 *                               the caller can refresh the drink panel grid.
 * @returns {{ open(): void }}  — call open() to show the panel with a fresh list
 */
export function initPresetPanel(onChanged) {
  const listEl      = document.getElementById('preset-manage-list');
  const listActions = document.getElementById('preset-list-actions');
  const editForm    = document.getElementById('preset-edit-form');

  function renderList() {
    const presets = loadPresets();
    if (presets.length === 0) {
      listEl.innerHTML = '<p class="log-empty">No presets.</p>';
      return;
    }
    const builtinIds = new Set(DEFAULT_DRINK_PRESETS.map(p => p.id));
    listEl.innerHTML = presets.map(p => `
      <div class="log-entry">
        <div class="log-entry-main">
          <div class="log-entry-name">${esc(p.name)}</div>
          <div class="log-entry-meta">${p.volume_ml} mL · ${p.abv_pct}% · ${p.duration_min} min${p.carbonated ? ' · carbonated' : ''}</div>
        </div>
        <div class="log-entry-actions">
          <button class="log-action-btn preset-edit-btn" data-id="${p.id}" aria-label="Edit ${esc(p.name)}">✎</button>
          <button class="log-action-btn preset-delete-btn" data-id="${p.id}"
                  aria-label="${builtinIds.has(p.id) ? 'Hide' : 'Delete'} ${esc(p.name)}">✕</button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.preset-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = presets.find(p => p.id === btn.dataset.id);
        if (preset) showForm(preset);
      });
    });
    listEl.querySelectorAll('.preset-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = presets.find(p => p.id === btn.dataset.id);
        if (!preset) return;
        const label = builtinIds.has(preset.id) ? `Hide "${preset.name}"?` : `Delete "${preset.name}"?`;
        if (window.confirm(label)) {
          deletePreset(preset.id);
          renderList();
          onChanged();
        }
      });
    });
  }

  function showForm(preset = null) {
    listEl.hidden      = true;
    listActions.hidden = true;
    editForm.hidden    = false;
    document.getElementById('preset-form-title').textContent = preset ? 'Edit Preset' : 'New Preset';
    document.getElementById('preset-edit-id').value       = preset?.id ?? '';
    document.getElementById('preset-edit-name').value     = preset?.name ?? '';
    document.getElementById('preset-edit-volume').value   = preset?.volume_ml ?? '';
    document.getElementById('preset-edit-abv').value      = preset?.abv_pct ?? '';
    document.getElementById('preset-edit-duration').value = preset?.duration_min ?? 15;
    document.getElementById('preset-edit-carbonated').checked = preset?.carbonated ?? false;
    document.getElementById('preset-edit-name').focus();
  }

  function hideForm() {
    editForm.hidden    = false; // keep re-checking after hide
    editForm.hidden    = true;
    listEl.hidden      = false;
    listActions.hidden = false;
  }

  document.getElementById('preset-add-btn').addEventListener('click', () => showForm(null));
  document.getElementById('preset-edit-cancel').addEventListener('click', hideForm);

  document.getElementById('preset-edit-save').addEventListener('click', () => {
    const id       = document.getElementById('preset-edit-id').value;
    const name     = document.getElementById('preset-edit-name').value.trim();
    const volume   = parseFloat(document.getElementById('preset-edit-volume').value);
    const abv      = parseFloat(document.getElementById('preset-edit-abv').value);
    const duration = parseInt(document.getElementById('preset-edit-duration').value, 10) || 0;
    const carbonated = document.getElementById('preset-edit-carbonated').checked;

    if (!name || !volume || isNaN(volume) || isNaN(abv)) {
      alert('Please fill in name, volume, and ABV.');
      return;
    }
    try {
      savePreset({ id: id || `custom_${Date.now()}`, name, volume_ml: volume,
                   abv_pct: abv, duration_min: duration, carbonated });
      hideForm();
      renderList();
      onChanged();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('preset-reset-btn').addEventListener('click', () => {
    if (window.confirm('Reset all presets to factory defaults? Your custom presets will be lost.')) {
      resetPresets();
      renderList();
      onChanged();
    }
  });

  document.querySelectorAll('.panel-close[data-close="preset-manage-panel"]').forEach(btn => {
    btn.addEventListener('click', () => {
      hideForm();
      closePanel('preset-manage-panel');
    });
  });

  return {
    open() {
      renderList();
      openPanel('preset-manage-panel');
    },
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function _saveDrink(drinkData, getSession, setSession, editIndex = null) {
  const now = drinkData.time_min ?? _nowMin();
  const drink = { time_min: now, ...drinkData };
  const session = getSession();
  let updated;
  if (editIndex !== null) {
    const drinks = session.drinks.map((d, i) => i === editIndex ? drink : d);
    updated = { ...session, drinks };
  } else {
    updated = { ...session, drinks: [...session.drinks, drink] };
  }
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

/** Convert minutes from midnight to HH:MM string for a time input. */
function _minToTime(t_min) {
  const h = Math.floor(t_min / 60) % 24;
  const m = Math.round(t_min) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Escape HTML entities. */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
