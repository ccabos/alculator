/**
 * Alculator — Session Export / Import
 * @module io/session_io
 *
 * JSON serialisation and schema validation for Alculator sessions.
 * No side effects; no browser API usage (works in Node/test environment).
 */

import { MEAL_SIZES } from '../model/constants.js';

const SCHEMA_VERSION = 'alculator-session-v2';

// ─── Schema validation ─────────────────────────────────────────────────────────

/**
 * Validate a parsed session object.
 *
 * @param {unknown} obj
 * @returns {string[]} Array of error messages; empty means valid.
 */
export function validateSchema(obj) {
  const errors = [];

  if (!obj || typeof obj !== 'object') {
    errors.push('Session must be a non-null object');
    return errors;
  }

  // Schema version
  if (obj.schema !== SCHEMA_VERSION) {
    errors.push(`Expected schema "${SCHEMA_VERSION}", got "${obj.schema}"`);
  }

  // Profile
  const p = obj.profile;
  if (!p || typeof p !== 'object') {
    errors.push('Missing required field: profile');
  } else {
    if (!['male', 'female'].includes(p.sex))
      errors.push(`profile.sex must be "male" or "female", got "${p.sex}"`);
    if (typeof p.weight_kg !== 'number' || p.weight_kg <= 0)
      errors.push('profile.weight_kg must be a positive number');
    if (typeof p.age !== 'number' || p.age <= 0)
      errors.push('profile.age must be a positive number');
  }

  // Drinks
  if (!Array.isArray(obj.drinks)) {
    errors.push('Missing required field: drinks (must be an array)');
  } else {
    for (let i = 0; i < obj.drinks.length; i++) {
      const d = obj.drinks[i];
      if (typeof d.time_min !== 'number')
        errors.push(`drinks[${i}].time_min must be a number`);
      if (typeof d.volume_ml !== 'number' || d.volume_ml <= 0)
        errors.push(`drinks[${i}].volume_ml must be a positive number`);
      if (typeof d.abv_pct !== 'number' || d.abv_pct < 0 || d.abv_pct > 100)
        errors.push(`drinks[${i}].abv_pct must be in [0, 100]`);
      if (typeof d.duration_min !== 'number' || d.duration_min < 0)
        errors.push(`drinks[${i}].duration_min must be a non-negative number`);
    }
  }

  // Food events
  if (!Array.isArray(obj.food_events)) {
    errors.push('Missing required field: food_events (must be an array)');
  } else {
    for (let i = 0; i < obj.food_events.length; i++) {
      const fe = obj.food_events[i];
      if (typeof fe.time_min !== 'number')
        errors.push(`food_events[${i}].time_min must be a number`);
      if (!MEAL_SIZES.includes(fe.type))
        errors.push(`food_events[${i}].type must be one of [${MEAL_SIZES.join(', ')}], got "${fe.type}"`);
    }
  }

  return errors;
}

// ─── Export ────────────────────────────────────────────────────────────────────

/**
 * Serialise a session to a JSON string.
 *
 * The exported object has the following structure:
 * {
 *   schema:      "alculator-session-v2",
 *   exported_at: ISO-8601 timestamp,
 *   profile:     { sex, weight_kg, age, height_cm? },
 *   drinks:      [{ time_min, volume_ml, abv_pct, carbonated, with_food, duration_min, ... }],
 *   food_events: [{ time_min, type }]
 * }
 *
 * @param {{ profile: object, drinks: object[], food_events: object[] }} session
 * @returns {string} JSON string
 */
export function exportJSON(session) {
  const payload = {
    schema:      SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    profile:     session.profile,
    drinks:      session.drinks,
    food_events: session.food_events,
  };
  return JSON.stringify(payload, null, 2);
}

// ─── Import ────────────────────────────────────────────────────────────────────

/**
 * Parse a JSON string and return a validated session object.
 *
 * Throws a descriptive Error if the JSON is malformed or fails schema validation.
 * No state is modified on failure.
 *
 * @param {string} json
 * @returns {{ profile: object, drinks: object[], food_events: object[] }}
 * @throws {Error}
 */
export function importJSON(json) {
  let obj;
  try {
    obj = JSON.parse(json);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }

  const errors = validateSchema(obj);
  if (errors.length > 0) {
    throw new Error(`Session validation failed:\n  • ${errors.join('\n  • ')}`);
  }

  return {
    profile:     obj.profile,
    drinks:      obj.drinks,
    food_events: obj.food_events,
  };
}
