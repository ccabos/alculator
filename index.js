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
  refreshPresetGrid, initPresetPanel,
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

  // Preset manager — refresh the drink panel grid whenever presets change
  const presetMgr = initPresetPanel(() => {
    refreshPresetGrid(loadPresets());
    redraw();
  });
  document.getElementById('manage-presets-btn').addEventListener('click', () => {
    presetMgr.open();
  });

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
    renderSessionLog(drinks, food_events, presets, _deleteDrink, _deleteFood, _editDrink, _editFood, _gestureDrink);
    return;
  }

  // Normalize times so after-midnight events appear after the evening events
  const { drinks: nDrinks, food_events: nFood, now_min } =
    _normalizeTimes(drinks, food_events, _nowMin());

  // Compute time window
  const all_t   = [
    now_min,
    ...nDrinks.map(d => d.time_min),
    ...nFood.map(f => f.time_min),
  ];
  const t_start = Math.min(...all_t) - 30;
  const t_end   = now_min + 120; // always show at least 2 h ahead

  // Run simulation
  const series   = bacSeries(nDrinks, nFood, profile, t_start, t_end);
  const now_idx  = series.findIndex(p => p.t_min >= now_min) ?? series.length - 1;
  const bac_now  = series[Math.max(0, now_idx)]?.bac_pct ?? 0;
  const bounds   = uncertaintyBounds(bac_now);
  // Find sober time — extend series if BAC is still above threshold at the view horizon
  let sober_t = findSoberTime(series);
  let extended = series;

  if (sober_t !== null && sober_t > t_end) {
    // BAC was still above threshold at the 2 h horizon; extend 6 h further to find real sober time
    extended = bacSeries(nDrinks, nFood, profile, t_start, sober_t + 360);
    sober_t  = findSoberTime(extended);
    // If BAC is still above threshold at the extended horizon, give up
    if (sober_t !== null && sober_t > extended[extended.length - 1].t_min) {
      sober_t = null;
    }
  }

  // Render (nDrinks/nFood used for chart positioning; fmtTime uses % 24 so
  // values >1440 still display as correct clock times in the log)
  renderBACDisplay(bac_now, bounds);
  renderSoberTime(sober_t);
  renderChart(extended, nDrinks, nFood, now_min);
  renderSessionLog(nDrinks, nFood, presets, _deleteDrink, _deleteFood, _editDrink, _editFood, _gestureDrink, _liveChartUpdate);
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

// ─── Gesture handler ───────────────────────────────────────────────────────────

/**
 * Apply a drag-gesture delta to a drink's start time and/or drinking duration.
 *
 * @param {number} index         — index into session.drinks
 * @param {number} dtTimeMins    — minutes to add to time_min (negative = earlier)
 * @param {number} dtDurMins     — minutes to add to duration_min (negative = shorter)
 */
function _gestureDrink(index, dtTimeMins, dtDurMins) {
  const drink = session.drinks[index];
  if (!drink) return;
  const updated = {
    ...drink,
    time_min:     Math.min(1439, Math.max(0, drink.time_min     + dtTimeMins)),
    duration_min: Math.max(0,    Math.min(180, (drink.duration_min ?? 0) + dtDurMins)),
  };
  const drinks = session.drinks.map((d, i) => i === index ? updated : d);
  session = { ...session, drinks };
  saveSession(session);
  redraw();
}

// ─── Live chart update during drag ────────────────────────────────────────────

/**
 * Re-render only the BAC chart (and header readout) with a hypothetical drink
 * position, without touching the session log so the ongoing drag state is
 * preserved.  Called by the gesture handler once per integer-minute change.
 *
 * @param {number} index      — index into session.drinks
 * @param {number} dtTimeMins — tentative delta for time_min
 * @param {number} dtDurMins  — tentative delta for duration_min
 */
function _liveChartUpdate(index, dtTimeMins, dtDurMins) {
  const { profile, food_events } = session;
  if (!profile?.sex || !profile?.weight_kg || !profile?.age) return; // no chart without profile

  const drink = session.drinks[index];
  if (!drink) return;

  const tempDrink = {
    ...drink,
    time_min:     Math.min(1439, Math.max(0, drink.time_min     + dtTimeMins)),
    duration_min: Math.max(0,    Math.min(180, (drink.duration_min ?? 0) + dtDurMins)),
  };
  const tempDrinks = session.drinks.map((d, i) => i === index ? tempDrink : d);

  const { drinks: nDrinks, food_events: nFood, now_min } =
    _normalizeTimes(tempDrinks, food_events, _nowMin());

  const all_t   = [now_min, ...nDrinks.map(d => d.time_min), ...nFood.map(f => f.time_min)];
  const t_start = Math.min(...all_t) - 30;
  const t_end   = now_min + 120;

  const series  = bacSeries(nDrinks, nFood, profile, t_start, t_end);
  const now_idx = series.findIndex(p => p.t_min >= now_min) ?? series.length - 1;
  const bac_now = series[Math.max(0, now_idx)]?.bac_pct ?? 0;
  const bounds  = uncertaintyBounds(bac_now);

  let sober_t = findSoberTime(series);
  let extended = series;
  if (sober_t !== null && sober_t > t_end) {
    extended = bacSeries(nDrinks, nFood, profile, t_start, sober_t + 360);
    sober_t  = findSoberTime(extended);
    if (sober_t !== null && sober_t > extended[extended.length - 1].t_min) sober_t = null;
  }

  renderBACDisplay(bac_now, bounds);
  renderSoberTime(sober_t);
  renderChart(extended, nDrinks, nFood, now_min);
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

/**
 * Offset drink/food times that crossed midnight so the timeline stays
 * monotonically increasing.
 *
 * Strategy: find the latest time_min in the session. Any event more than
 * 12 h (720 min) earlier than that anchor is assumed to have wrapped past
 * midnight and gets +1440. `now_min` is treated the same way.
 *
 * Example: session started at 22:00 (1320), now is 01:30 (90).
 * tMax = 1320. shift(90) → 90+1440 = 1530. ✓
 */
function _normalizeTimes(drinks, food_events, now_min) {
  const allTimes = [
    ...drinks.map(d => d.time_min),
    ...food_events.map(f => f.time_min),
  ];
  if (allTimes.length === 0) return { drinks, food_events, now_min };
  const tMax  = Math.max(...allTimes);
  const shift = t => (tMax - t > 720 ? t + 1440 : t);
  return {
    drinks:      drinks.map(d      => ({ ...d, time_min: shift(d.time_min) })),
    food_events: food_events.map(f => ({ ...f, time_min: shift(f.time_min) })),
    now_min:     shift(now_min),
  };
}

/** Age of a stored session in minutes. Returns Infinity if no timestamp. */
function _sessionAge(saved_at) {
  if (!saved_at) return Infinity;
  const diff = Date.now() - new Date(saved_at).getTime();
  return diff / 60_000;
}

// ─── PWA install prompt ────────────────────────────────────────────────────────

(function initInstall() {
  const btn = document.getElementById('install-btn');
  let deferredPrompt = null;

  // Android/Chrome: capture the install prompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    btn.hidden = false;
  });

  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btn.hidden = true;
  });

  // Hide button once installed
  window.addEventListener('appinstalled', () => { btn.hidden = true; });

  // iOS Safari: show the share-sheet hint if not already in standalone mode
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  if (isIos && !isStandalone) {
    const banner = document.getElementById('ios-install-banner');
    banner.hidden = false;
    document.getElementById('ios-install-close').addEventListener('click', () => {
      banner.hidden = true;
    });
  }
})();

// ─── Start ────────────────────────────────────────────────────────────────────

boot();
