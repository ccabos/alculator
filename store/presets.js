/**
 * Alculator — Preset Library Storage Adapter
 * @module store/presets
 *
 * localStorage CRUD for user-customised drink presets.
 * Delegates all pure logic to model/presets.js; this module owns only I/O.
 *
 * Storage key: "alculator_preset_overrides"
 * Value: JSON array of override objects.  Each override is either:
 *   - A full or partial preset (merged on top of a matching built-in by id), or
 *   - { id, hidden: true } — marks a built-in as hidden without deleting it.
 */

import { DEFAULT_DRINK_PRESETS } from '../model/constants.js';
import { buildPresetList, validatePreset } from '../model/presets.js';

const STORAGE_KEY = 'alculator_preset_overrides';

// ─── Private helpers ───────────────────────────────────────────────────────────

function readOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOverrides(overrides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the current visible preset list, merging built-in defaults with any
 * user overrides stored in localStorage.
 * @returns {object[]}
 */
export function loadPresets() {
  return buildPresetList(readOverrides());
}

/**
 * Save a preset.  Overwrites any existing preset or override with the same id.
 * If the id matches a built-in preset, the built-in is overridden for this user.
 * If the id is new, a custom preset is added.
 *
 * Throws if the preset fails validation (see model/presets.js validatePreset).
 *
 * @param {object} preset — must include: id, name, volume_ml, abv_pct,
 *                          carbonated, duration_min
 * @throws {Error}
 */
export function savePreset(preset) {
  const errors = validatePreset(preset);
  if (errors.length > 0) throw new Error(`Invalid preset: ${errors.join('; ')}`);

  const overrides = readOverrides();
  const idx = overrides.findIndex(o => o.id === preset.id);
  if (idx === -1) {
    overrides.push({ ...preset });
  } else {
    overrides[idx] = { ...overrides[idx], ...preset, hidden: false };
  }
  writeOverrides(overrides);
}

/**
 * Delete a preset by id.
 * - Built-in presets: marked as hidden (cannot be permanently deleted).
 * - Custom presets: removed entirely.
 * Unknown ids are ignored.
 *
 * @param {string} id
 */
export function deletePreset(id) {
  const isBuiltin = DEFAULT_DRINK_PRESETS.some(p => p.id === id);
  const overrides = readOverrides();
  const idx = overrides.findIndex(o => o.id === id);

  if (isBuiltin) {
    if (idx === -1) {
      overrides.push({ id, hidden: true });
    } else {
      overrides[idx] = { id, hidden: true };
    }
  } else {
    if (idx !== -1) overrides.splice(idx, 1);
  }

  writeOverrides(overrides);
}

/**
 * Remove all user customisations, restoring the built-in preset library.
 */
export function resetPresets() {
  localStorage.removeItem(STORAGE_KEY);
}
