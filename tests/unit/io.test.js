/**
 * Tests for io/session_io.js
 * Covers §6.1 "Export/Import" group.
 */

import { describe, it, expect } from 'vitest';
import { exportJSON, importJSON, validateSchema } from '../../io/session_io.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const PROFILE = { sex: 'male', weight_kg: 70, height_cm: 175, age: 30 };

const DRINKS = [
  {
    time_min: 1140, volume_ml: 150, abv_pct: 12,
    carbonated: false, with_food: false, duration_min: 15,
  },
];

const FOOD_EVENTS = [
  { time_min: 1110, type: 'heavy_meal' },
];

const SESSION = { profile: PROFILE, drinks: DRINKS, food_events: FOOD_EVENTS };

// ─── export→import round-trip ─────────────────────────────────────────────────

describe('exportJSON / importJSON', () => {
  it('§6.1: export→import round-trip produces identical session', () => {
    const json = exportJSON(SESSION);
    const reimported = importJSON(json);
    expect(reimported.profile).toEqual(PROFILE);
    expect(reimported.drinks).toEqual(DRINKS);
    expect(reimported.food_events).toEqual(FOOD_EVENTS);
  });

  it('§6.1: reimported food event type is preserved', () => {
    const json = exportJSON(SESSION);
    const { food_events } = importJSON(json);
    expect(food_events[0].type).toBe('heavy_meal');
    expect(food_events[0].time_min).toBe(1110);
  });
});

// ─── import error cases ───────────────────────────────────────────────────────

describe('importJSON — error handling', () => {
  it('§6.1: malformed JSON → throws Error, session unchanged', () => {
    expect(() => importJSON('not json {')).toThrowError(/Invalid JSON/i);
  });

  it('§6.1: wrong schema version → throws validation Error', () => {
    const json = exportJSON(SESSION).replace('alculator-session-v2', 'alculator-session-v1');
    expect(() => importJSON(json)).toThrowError(/validation failed/i);
  });
});
