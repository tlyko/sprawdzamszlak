// Tests for the GeoJSON-payload narrowing helper. Two upstream shapes
// (Feature vs FeatureCollection), one whitelist-cast for properties,
// strict per-coordinate validation. Drops unknown property keys silently
// — important: if this ever passes through arbitrary fields it'd be a
// type-safety hole on every consumer downstream.

import { describe, expect, it } from 'vitest';

import { extractTripMeta } from './extract-trip-meta';

describe('extractTripMeta — payload shape', () => {
  it('narrows a single Feature with LineString geometry', () => {
    const payload = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [20.0, 49.1, 1200],
          [20.1, 49.2, 1300],
        ],
      },
      properties: { name: 'Granią', sport_type: 'Hike' },
    };
    const meta = extractTripMeta(payload);
    expect(meta).not.toBeNull();
    expect(meta!.coordinates).toEqual([
      [20.0, 49.1, 1200],
      [20.1, 49.2, 1300],
    ]);
    expect(meta!.properties.name).toBe('Granią');
  });

  it('extracts the first Feature from a FeatureCollection', () => {
    const payload = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[20, 49]] },
          properties: { name: 'Older seed' },
        },
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[21, 50]] },
          properties: { name: 'second' },
        },
      ],
    };
    const meta = extractTripMeta(payload);
    expect(meta?.properties.name).toBe('Older seed');
  });

  it('returns null on null input', () => {
    expect(extractTripMeta(null)).toBeNull();
  });

  it('returns null on garbage payload', () => {
    expect(extractTripMeta('not geojson')).toBeNull();
    expect(extractTripMeta(42)).toBeNull();
    expect(extractTripMeta({ type: 'Point' })).toBeNull();
  });

  it('returns null on empty FeatureCollection', () => {
    expect(extractTripMeta({ type: 'FeatureCollection', features: [] })).toBeNull();
  });
});

describe('extractTripMeta — coordinates', () => {
  it('keeps 2-tuples and 3-tuples as-is', () => {
    const meta = extractTripMeta({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [20, 49],
          [20.1, 49.1, 1300],
        ],
      },
    })!;
    expect(meta.coordinates).toEqual([
      [20, 49],
      [20.1, 49.1, 1300],
    ]);
  });

  it('drops malformed tuples (wrong length, non-numbers)', () => {
    const meta = extractTripMeta({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [20, 49],
          [20, 49, 1200, 'extra'], // too long
          ['twenty', 'forty-nine'], // strings
          [20], // too short
          [20, 49, 'high'], // 3rd is string
          [20, NaN], // NaN rejected by Number.isFinite
        ],
      },
    })!;
    // Only the first valid tuple survives.
    expect(meta.coordinates).toEqual([[20, 49]]);
  });

  it('returns empty coordinates when geometry is not a LineString', () => {
    const meta = extractTripMeta({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [20, 49],
      },
    })!;
    expect(meta.coordinates).toEqual([]);
  });
});

describe('extractTripMeta — properties whitelist', () => {
  it('passes through every typed key when valid', () => {
    const meta = extractTripMeta({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[20, 49]] },
      properties: {
        name: 'Krywań',
        sport_type: 'Hike',
        start_date: '2025-08-15T05:30:00Z',
        distance: 8430,
        total_elevation_gain: 920,
        description: 'piękny dzień',
        source: 'strava',
        strava_activity_id: 12345,
      },
    })!;
    expect(meta.properties).toEqual({
      name: 'Krywań',
      sport_type: 'Hike',
      start_date: '2025-08-15T05:30:00Z',
      distance: 8430,
      total_elevation_gain: 920,
      description: 'piękny dzień',
      source: 'strava',
      strava_activity_id: 12345,
    });
  });

  it('drops unknown keys (no surface for arbitrary upstream fields)', () => {
    const meta = extractTripMeta({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[20, 49]] },
      properties: {
        name: 'Krywań',
        injected_html: '<script>',
        attacker_field: 'value',
      },
    })!;
    expect(meta.properties).toEqual({ name: 'Krywań' });
    // Defensive: Object.keys explicitly verifies no extras leaked.
    expect(Object.keys(meta.properties)).toEqual(['name']);
  });

  it('rejects non-string source values that aren\'t in the enum', () => {
    const meta = extractTripMeta({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[20, 49]] },
      properties: { source: 'made-up-value' },
    })!;
    expect(meta.properties.source).toBeUndefined();
  });

  it('drops empty/whitespace-only description', () => {
    const meta = extractTripMeta({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[20, 49]] },
      properties: { description: '   ' },
    })!;
    expect(meta.properties.description).toBeUndefined();
  });

  it('drops non-finite numbers (NaN, Infinity)', () => {
    const meta = extractTripMeta({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[20, 49]] },
      properties: {
        distance: Number.NaN,
        total_elevation_gain: Number.POSITIVE_INFINITY,
        strava_activity_id: Number.NEGATIVE_INFINITY,
      },
    })!;
    expect(meta.properties.distance).toBeUndefined();
    expect(meta.properties.total_elevation_gain).toBeUndefined();
    expect(meta.properties.strava_activity_id).toBeUndefined();
  });

  it('returns empty properties object when feature has no properties block', () => {
    const meta = extractTripMeta({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[20, 49]] },
    })!;
    expect(meta.properties).toEqual({});
  });
});
