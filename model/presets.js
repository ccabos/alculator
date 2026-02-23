/**
 * Alculator — Drink Preset Management (Pure Layer)
 * @module model/presets
 *
 * Pure functions for managing the drink preset library.
 * No localStorage access; no side effects.  The storage adapter lives in
 * store/presets.js, which calls these functions and handles persistence.
 */

import { DEFAULT_DRINK_PRESETS } from './constants.js';

// ─── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a preset object.  Returns an array of human-readable error strings;
 * an empty array means the preset is valid.
 *
 * @param {unknown} obj
 * @returns {string[]}
 */
export function validatePreset(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') {
    return ['Preset must be a non-null object'];
  }
  if (typeof obj.id !== 'string' || obj.id.trim() === '') {
    errors.push('id must be a non-empty string');
  }
  if (typeof obj.name !== 'string' || obj.name.trim() === '') {
    errors.push('name must be a non-empty string');
  }
  if (typeof obj.volume_ml !== 'number' || obj.volume_ml <= 0) {
    errors.push('volume_ml must be a positive number');
  }
  if (typeof obj.abv_pct !== 'number' || obj.abv_pct < 0 || obj.abv_pct > 100) {
    errors.push('abv_pct must be a number in [0, 100]');
  }
  if (typeof obj.carbonated !== 'boolean') {
    errors.push('carbonated must be a boolean');
  }
  if (typeof obj.duration_min !== 'number' || obj.duration_min < 0 || !Number.isFinite(obj.duration_min)) {
    errors.push('duration_min must be a finite non-negative number');
  }
  return errors;
}

// ─── Merge ─────────────────────────────────────────────────────────────────────

/**
 * Merge the built-in default presets with user overrides.
 *
 * Rules:
 *   • A user override with the same `id` as a built-in replaces the built-in.
 *   • User overrides with new ids are appended after the built-ins.
 *   • The resulting list preserves built-in order first, then custom-only entries.
 *   • Hidden built-ins are represented by an override with `hidden: true`; they
 *     are excluded from the returned list.
 *
 * @param {ReadonlyArray<object>} builtins — DEFAULT_DRINK_PRESETS
 * @param {object[]} overrides             — user customisations from localStorage
 * @returns {object[]}                     — merged, ordered list of visible presets
 */
export function mergePresets(builtins, overrides) {
  const overrideMap = new Map(overrides.map(o => [o.id, o]));

  const merged = [];

  // Walk built-ins in order; apply any override
  for (const builtin of builtins) {
    const override = overrideMap.get(builtin.id);
    if (override) {
      if (!override.hidden) merged.push({ ...builtin, ...override });
      // hidden overrides are simply omitted
    } else {
      merged.push({ ...builtin });
    }
  }

  // Append custom-only entries (ids not present in builtins)
  const builtinIds = new Set(builtins.map(b => b.id));
  for (const override of overrides) {
    if (!builtinIds.has(override.id) && !override.hidden) {
      merged.push({ ...override });
    }
  }

  return merged;
}

// ─── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Find a preset by id in an already-merged list.  Returns undefined if not found.
 * @param {object[]} presets
 * @param {string} id
 * @returns {object|undefined}
 */
export function findPresetById(presets, id) {
  return presets.find(p => p.id === id);
}

/**
 * Return a sorted copy of a preset list (alphabetical by name).
 * @param {object[]} presets
 * @returns {object[]}
 */
export function sortPresets(presets) {
  return [...presets].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Apply a per-entry override to a preset list, returning a new list.
 * Used to produce the final merged list after a user edits or adds a preset.
 *
 * @param {object[]} presets   — current merged list
 * @param {object}   override  — partial or full preset; must include id
 * @returns {object[]}
 */
export function applyOverride(presets, override) {
  const idx = presets.findIndex(p => p.id === override.id);
  if (idx === -1) return [...presets, override];
  const updated = [...presets];
  updated[idx] = { ...presets[idx], ...override };
  return updated;
}

/**
 * Convenience: build the visible preset list from DEFAULT_DRINK_PRESETS and
 * a raw overrides array (as would be loaded from localStorage).
 * @param {object[]} [overrides=[]]
 * @returns {object[]}
 */
export function buildPresetList(overrides = []) {
  return mergePresets(DEFAULT_DRINK_PRESETS, overrides);
}
