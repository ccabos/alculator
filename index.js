/**
 * Alculator — Application Bootstrap
 * @module index
 *
 * Entry point.  Wires together the model, store, I/O, and UI layers:
 *   1. Loads the stored session from localStorage
 *   2. Prompts to clear sessions older than 24 h
 *   3. Renders all UI components with the loaded data
 *   4. Handles the action-bar buttons (Add Drink, Food, Profile, Export, Import)
 *   5. Re-renders on every alculator:session-changed event
 *   6. Advances a 1-minute clock timer for live chart updates
 */

import { bacSeries, findSoberTime, uncertaintyBounds } from './model/bac.js';
import { loadSession, saveSession, clearSession }       from './store/session.js';
import { exportJSON, importJSON }                       from './io/session_io.js';
import { loadPresets }                                  from './store/presets.js';
import { renderBACDisplay, renderSoberTime, renderSessionLog } from './ui/display.js';
import { renderChart }  from './ui/chart.js';
import {
  openPanel, closePanel,
  initDrinkPanel, initFoodPanel, initProfilePanel, populateProfilePanel,
  openDrinkPanelForEdit, openFoodPanelForEdit, resetDrinkPanel,
} from './ui/form.js';

// ─── Application state ────────────────────────────────────────────────────────

let session = {
  profile:     null,
  drinks:      [],
  food_events: [],
};
function getSession()       { return session; }
function setSession(s)      { session = s; }

// ─── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  // 1. Load persisted session
  const stored = loadSession();
  if (stored) {
    // Prompt to clear if older than 24 h
    if (_sessionAge(stored.saved_at) > 24 * 60) {
      const clear = window.confirm(
        'Your last session is more than 24 hours old. Start a fresh session?'
      );
      if (clear) {
        clearSession();
      } else {
        session = { profile: stored.profile, drinks: stored.drinks, food_events: stored.food_events };
      }
    } else {
      session = { profile: stored.profile, drinks: stored.drinks, food_events: stored.food_events };
    }
  }

  // 2. Initialise panels
  const presets = loadPresets();
  initDrinkPanel(presets, getSession, setSession);
  initFoodPanel(getSession, setSession);
  initProfilePanel(getSession, setSession);
  populateProfilePanel(session.profile);

  // 3. Wire action-bar buttons
  document.getElementById('add-drink-btn').addEventListener('click', () => {
    resetDrinkPanel();
    openPanel('drink-panel');
  });
  document.getElementById('add-food-btn').addEventListener('click', () => openPanel('food-panel'));
  document.getElementById('profile-btn').addEventListener('click', () => {
    populateProfilePanel(session.profile);
    openPanel('profile-panel');
  });
  document.getElementById('open-profile-btn')?.addEventListener('click', () => openPanel('profile-panel'));

  // Close buttons
  document.querySelectorAll('.panel-close[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closePanel(btn.dataset.close));
  });
  document.getElementById('panel-backdrop').addEventListener('click', () => {
    document.querySelectorAll('.panel:not([hidden])').forEach(p => closePanel(p.id));
  });

  // Manual refresh
  document.getElementById('refresh-btn').addEventListener('click', redraw);

  // Disclaimer close
  document.getElementById('disclaimer-close').addEventListener('click', () => {
    document.getElementById('disclaimer').hidden = true;
  });

  // Export
  document.getElementById('export-btn').addEventListener('click', () => {
    const json = exportJSON(session);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href     = url;
    a.download = `alculator-session-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const imported = importJSON(ev.target.result);
        const replaceProfile = window.confirm(
          'Import this session? Your current profile will be replaced.'
        );
        if (!replaceProfile) {
          imported.profile = session.profile;
        }
        session = imported;
        saveSession(session);
        populateProfilePanel(session.profile);
        redraw();
      } catch (err) {
        alert(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // allow re-import of same file
  });

  // 4. Listen for session changes (from any panel save)
  window.addEventListener('alculator:session-changed', () => redraw());

  // 5. Initial render
  redraw();

  // 6. 1-minute clock ticker
  setInterval(redraw, 60_000);
}

// ─── Redraw ────────────────────────────────────────────────────────────────────

function redraw() {
  const { profile, drinks, food_events } = session;
  const presets = loadPresets();

  // Profile guard
  const profileComplete = profile && profile.sex && profile.weight_kg && profile.age;
  document.getElementById('profile-guard').hidden = profileComplete;
  document.getElementById('chart-area').hidden    = !profileComplete;
  document.getElementById('bac-display').style.opacity = profileComplete ? '1' : '0.3';

  if (!profileComplete) {
    renderSessionLog(drinks, food_events, presets, _deleteDrink, _deleteFood, _editDrink, _editFood);
    return;
  }

  // Compute time window
  const now_min = _nowMin();
  const all_t   = [
    now_min,
    ...drinks.map(d => d.time_min),
    ...food_events.map(f => f.time_min),
  ];
  const t_start = Math.min(...all_t) - 30;
  const t_end   = now_min + 120; // always show at least 2 h ahead

  // Run simulation
  const series   = bacSeries(drinks, food_events, profile, t_start, t_end);
  const now_idx  = series.findIndex(p => p.t_min >= now_min) ?? series.length - 1;
  const bac_now  = series[Math.max(0, now_idx)]?.bac_pct ?? 0;
  const bounds   = uncertaintyBounds(bac_now);
  const sober_t  = findSoberTime(series);

  // Extend series to sober time if needed
  const extended = (sober_t && sober_t > t_end)
    ? bacSeries(drinks, food_events, profile, t_start, sober_t + 30)
    : series;

  // Render
  renderBACDisplay(bac_now, bounds);
  renderSoberTime(sober_t);
  renderChart(extended, drinks, food_events, now_min);
  renderSessionLog(drinks, food_events, presets, _deleteDrink, _deleteFood, _editDrink, _editFood);
}

// ─── Delete handlers ──────────────────────────────────────────────────────────

function _deleteDrink(index) {
  session = { ...session, drinks: session.drinks.filter((_, i) => i !== index) };
  saveSession(session);
  redraw();
}

function _deleteFood(index) {
  session = { ...session, food_events: session.food_events.filter((_, i) => i !== index) };
  saveSession(session);
  redraw();
}

// ─── Edit handlers ─────────────────────────────────────────────────────────────

function _editDrink(index) {
  openDrinkPanelForEdit(session.drinks[index], index);
}

function _editFood(index) {
  openFoodPanelForEdit(session.food_events[index], index);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _nowMin() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Age of a stored session in minutes. Returns Infinity if no timestamp. */
function _sessionAge(saved_at) {
  if (!saved_at) return Infinity;
  const diff = Date.now() - new Date(saved_at).getTime();
  return diff / 60_000;
}

// ─── Start ────────────────────────────────────────────────────────────────────

boot();
