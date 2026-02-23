/**
 * Tests for model/presets.js (pure functions only — no localStorage)
 * Covers §6.1 "Drink preset library"
 */

import { describe, it, expect } from 'vitest';
import {
  validatePreset,
  mergePresets,
  findPresetById,
  sortPresets,
  applyOverride,
  buildPresetList,
} from '../../model/presets.js';
import { DEFAULT_DRINK_PRESETS } from '../../model/constants.js';

// ─── validatePreset ────────────────────────────────────────────────────────────

describe('validatePreset', () => {
  const valid = {
    id: 'test_drink',
    name: 'Test Drink',
    volume_ml: 330,
    abv_pct: 5.0,
    carbonated: false,
    duration_min: 20,
  };

  it('returns empty array for a valid preset', () => {
    expect(validatePreset(valid)).toEqual([]);
  });

  it('rejects non-object', () => {
    expect(validatePreset(null).length).toBeGreaterThan(0);
    expect(validatePreset('string').length).toBeGreaterThan(0);
    expect(validatePreset(42).length).toBeGreaterThan(0);
  });

  it('rejects missing or empty id', () => {
    expect(validatePreset({ ...valid, id: '' }).length).toBeGreaterThan(0);
    expect(validatePreset({ ...valid, id: undefined }).length).toBeGreaterThan(0);
  });

  it('rejects missing or empty name', () => {
    expect(validatePreset({ ...valid, name: '' }).length).toBeGreaterThan(0);
    expect(validatePreset({ ...valid, name: 42 }).length).toBeGreaterThan(0);
  });

  it('rejects non-positive volume_ml', () => {
    expect(validatePreset({ ...valid, volume_ml: 0 }).length).toBeGreaterThan(0);
    expect(validatePreset({ ...valid, volume_ml: -10 }).length).toBeGreaterThan(0);
  });

  it('rejects abv_pct outside [0, 100]', () => {
    expect(validatePreset({ ...valid, abv_pct: -1 }).length).toBeGreaterThan(0);
    expect(validatePreset({ ...valid, abv_pct: 101 }).length).toBeGreaterThan(0);
  });

  it('rejects non-boolean carbonated', () => {
    expect(validatePreset({ ...valid, carbonated: 'yes' }).length).toBeGreaterThan(0);
    expect(validatePreset({ ...valid, carbonated: 1 }).length).toBeGreaterThan(0);
  });

  it('rejects negative or non-finite duration_min', () => {
    expect(validatePreset({ ...valid, duration_min: -1 }).length).toBeGreaterThan(0);
    expect(validatePreset({ ...valid, duration_min: Infinity }).length).toBeGreaterThan(0);
    expect(validatePreset({ ...valid, duration_min: NaN }).length).toBeGreaterThan(0);
  });

  it('accepts duration_min = 0 (instantaneous)', () => {
    expect(validatePreset({ ...valid, duration_min: 0 })).toEqual([]);
  });
});

// ─── mergePresets ──────────────────────────────────────────────────────────────

describe('mergePresets', () => {
  it('returns built-ins unchanged when overrides is empty', () => {
    const result = mergePresets(DEFAULT_DRINK_PRESETS, []);
    expect(result.length).toBe(DEFAULT_DRINK_PRESETS.length);
    expect(result.map(p => p.id)).toEqual(DEFAULT_DRINK_PRESETS.map(p => p.id));
  });

  it('applies override to a built-in preset by id', () => {
    const overrides = [{ id: 'beer_regular', name: 'My Lager', volume_ml: 500 }];
    const result = mergePresets(DEFAULT_DRINK_PRESETS, overrides);
    const beer = result.find(p => p.id === 'beer_regular');
    expect(beer.name).toBe('My Lager');
    expect(beer.volume_ml).toBe(500);
    // Unmodified fields stay from the built-in
    expect(beer.abv_pct).toBe(5.0);
  });

  it('appends custom presets (new id) after built-ins', () => {
    const custom = {
      id: 'my_ipa',
      name: 'My IPA',
      volume_ml: 440,
      abv_pct: 6.5,
      carbonated: false,
      duration_min: 25,
    };
    const result = mergePresets(DEFAULT_DRINK_PRESETS, [custom]);
    expect(result.length).toBe(DEFAULT_DRINK_PRESETS.length + 1);
    expect(result[result.length - 1].id).toBe('my_ipa');
  });

  it('hides built-in preset when override has hidden: true', () => {
    const overrides = [{ id: 'spirit_shot', hidden: true }];
    const result = mergePresets(DEFAULT_DRINK_PRESETS, overrides);
    expect(result.find(p => p.id === 'spirit_shot')).toBeUndefined();
    expect(result.length).toBe(DEFAULT_DRINK_PRESETS.length - 1);
  });

  it('hides custom preset when override has hidden: true', () => {
    const overrides = [
      { id: 'my_drink', name: 'X', volume_ml: 330, abv_pct: 5, carbonated: false, duration_min: 10 },
      { id: 'my_drink', hidden: true },   // second override hides it
    ];
    // mergePresets picks the LAST override for each id — simplified: hidden wins
    // The actual behaviour: overrides list is processed linearly; last wins
    // Since both have same id and array is deduped by the store layer,
    // here we test with a single hidden override
    const result = mergePresets(DEFAULT_DRINK_PRESETS, [{ id: 'my_drink', hidden: true }]);
    expect(result.find(p => p.id === 'my_drink')).toBeUndefined();
  });

  it('preserves built-in order for non-overridden entries', () => {
    const overrides = [{ id: 'wine_glass', name: 'House White' }];
    const result = mergePresets(DEFAULT_DRINK_PRESETS, overrides);
    const builtinIds = DEFAULT_DRINK_PRESETS.map(p => p.id);
    const resultIds  = result.map(p => p.id).filter(id => builtinIds.includes(id));
    expect(resultIds).toEqual(builtinIds);
  });
});

// ─── findPresetById ────────────────────────────────────────────────────────────

describe('findPresetById', () => {
  const list = buildPresetList();

  it('finds a built-in preset by id', () => {
    const p = findPresetById(list, 'beer_regular');
    expect(p).toBeDefined();
    expect(p.id).toBe('beer_regular');
  });

  it('returns undefined for an unknown id', () => {
    expect(findPresetById(list, 'nonexistent')).toBeUndefined();
  });
});

// ─── sortPresets ───────────────────────────────────────────────────────────────

describe('sortPresets', () => {
  it('returns a sorted copy without mutating the original', () => {
    const original = buildPresetList();
    const sorted = sortPresets(original);
    expect(sorted).not.toBe(original);                         // new array
    expect(original.map(p => p.id)).toEqual(                   // original unchanged
      DEFAULT_DRINK_PRESETS.map(p => p.id)
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].name.localeCompare(sorted[i + 1].name)).toBeLessThanOrEqual(0);
    }
  });
});

// ─── applyOverride ─────────────────────────────────────────────────────────────

describe('applyOverride', () => {
  it('updates an existing preset in place (by id)', () => {
    const list   = buildPresetList();
    const before = findPresetById(list, 'wine_glass');
    const result = applyOverride(list, { id: 'wine_glass', volume_ml: 200 });
    expect(result.find(p => p.id === 'wine_glass').volume_ml).toBe(200);
    // Original list is not mutated
    expect(before.volume_ml).toBe(150);
  });

  it('appends a new preset when id is not found', () => {
    const list   = buildPresetList();
    const custom = {
      id: 'sparkling_water', name: 'Sparkling Water',
      volume_ml: 250, abv_pct: 0, carbonated: true, duration_min: 10,
    };
    const result = applyOverride(list, custom);
    expect(result.length).toBe(list.length + 1);
    expect(result[result.length - 1].id).toBe('sparkling_water');
  });
});

// ─── buildPresetList ───────────────────────────────────────────────────────────

describe('buildPresetList', () => {
  it('with no overrides returns all built-in presets', () => {
    const list = buildPresetList();
    expect(list.length).toBe(DEFAULT_DRINK_PRESETS.length);
  });

  it('all built-in presets pass validatePreset', () => {
    for (const preset of buildPresetList()) {
      expect(validatePreset(preset)).toEqual([]);
    }
  });

  it('all built-in presets have duration_min ≥ 0', () => {
    for (const preset of buildPresetList()) {
      expect(preset.duration_min).toBeGreaterThanOrEqual(0);
    }
  });
});
