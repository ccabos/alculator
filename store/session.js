/**
 * Alculator — Session Persistence
 * @module store/session
 *
 * localStorage CRUD for the active session (profile, drinks, food_events).
 * Dispatches a custom DOM event after every write so UI components can
 * react without polling.
 *
 * Key: "alculator_session"
 * Saved format: JSON matching io/session_io exportJSON schema, with an extra
 *   "saved_at" ISO timestamp field.
 *
 * Profile is preserved across clearSession() — only drinks and food_events
 * are removed, because the user's body measurements are unlikely to change
 * within a session.
 */

const STORAGE_KEY = 'alculator_session';
const CHANGE_EVENT = 'alculator:session-changed';

// ─── Save ──────────────────────────────────────────────────────────────────────

/**
 * Persist the session to localStorage and notify listeners.
 *
 * @param {{ profile: object, drinks: object[], food_events: object[] }} session
 */
export function saveSession(session) {
  const payload = {
    schema:      'alculator-session-v2',
    saved_at:    new Date().toISOString(),
    profile:     session.profile,
    drinks:      session.drinks,
    food_events: session.food_events,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: session }));
}

// ─── Load ──────────────────────────────────────────────────────────────────────

/**
 * Load the stored session from localStorage.
 *
 * Returns null if no session is stored or if the stored data is corrupt.
 *
 * @returns {{ profile: object, drinks: object[], food_events: object[], saved_at: string }|null}
 */
export function loadSession() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    return {
      profile:     obj.profile     ?? null,
      drinks:      Array.isArray(obj.drinks)      ? obj.drinks      : [],
      food_events: Array.isArray(obj.food_events) ? obj.food_events : [],
      saved_at:    obj.saved_at    ?? null,
    };
  } catch {
    return null;
  }
}

// ─── Clear ─────────────────────────────────────────────────────────────────────

/**
 * Remove drinks and food_events from the stored session, preserving the profile.
 *
 * If no session exists, this is a no-op.
 * Dispatches alculator:session-changed after clearing.
 */
export function clearSession() {
  const session = loadSession();
  const profile = session?.profile ?? null;
  const cleared = { profile, drinks: [], food_events: [] };
  const payload = {
    schema:      'alculator-session-v2',
    saved_at:    new Date().toISOString(),
    profile,
    drinks:      [],
    food_events: [],
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: cleared }));
}
