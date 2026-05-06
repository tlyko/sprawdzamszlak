// Tests for buildGeoJSON — the pure-function seam between Strava streams
// and what we PUT to S3. Three things ride on this conversion being right:
//   1. Strava ships [lat, lng]; GeoJSON expects [lng, lat]. Wrong here →
//      every trail renders mirrored across y=x on the map.
//   2. Altitude is optional per-coordinate; LineString tuples must stay
//      either 2- or 3-wide consistently within the array.
//   3. activity.id stays a number on the way into properties (downstream
//      code keys on it numerically).

import { describe, expect, it, vi } from 'vitest';
import type { StravaActivity } from '@sprawdzamszlak/shared';

// fetcher.ts imports from ../clients.js which calls envOrThrow at module
// load. Tests don't exercise the AWS clients, so mocking the whole module
// keeps us off any AWS-SDK construction path. Shapes don't matter — we
// only call buildGeoJSON in this file.
vi.mock('../clients.js', () => ({
  ssm: { send: vi.fn() },
  ddb: { send: vi.fn() },
  s3: { send: vi.fn() },
  envOrThrow: () => 'test-stub',
}));

import { buildGeoJSON, type StravaStreams } from './fetcher.js';

const baseActivity: StravaActivity = {
  id: 12345678,
  name: 'Granią',
  sport_type: 'Hike',
  start_date: '2025-08-15T05:30:00Z',
  distance: 8430,
  total_elevation_gain: 920,
};

const baseStreams: StravaStreams = {
  // [lat, lng] pairs — Strava order.
  latlng: {
    data: [
      [49.179, 20.088],
      [49.180, 20.090],
      [49.181, 20.092],
    ],
  },
  altitude: { data: [1200, 1250, 1310] },
};

describe('buildGeoJSON', () => {
  it('returns a Feature with type=Feature and LineString geometry', () => {
    const result = buildGeoJSON(baseActivity, baseStreams);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('Feature');
    expect(result!.geometry.type).toBe('LineString');
  });

  it('flips Strava [lat, lng] to GeoJSON [lng, lat] order', () => {
    const result = buildGeoJSON(baseActivity, baseStreams)!;
    // First coord: Strava sent [49.179, 20.088]; GeoJSON should be [20.088, 49.179, alt]
    expect(result.geometry.coordinates[0]).toEqual([20.088, 49.179, 1200]);
    expect(result.geometry.coordinates[1]).toEqual([20.09, 49.18, 1250]);
    expect(result.geometry.coordinates[2]).toEqual([20.092, 49.181, 1310]);
  });

  it('omits altitude when the streams payload lacks an altitude block', () => {
    const result = buildGeoJSON(baseActivity, { latlng: baseStreams.latlng })!;
    expect(result.geometry.coordinates[0]).toEqual([20.088, 49.179]);
    expect(result.geometry.coordinates[0]).toHaveLength(2);
  });

  it('mixes 2- and 3-tuples per-coordinate when altitude is partial', () => {
    const result = buildGeoJSON(baseActivity, {
      latlng: baseStreams.latlng,
      // Only the middle sample has an altitude — first and last drop the
      // third coordinate. Rare in practice but the code allows it.
      altitude: { data: [Number.NaN, 1250, undefined as unknown as number] },
    })!;
    expect(result.geometry.coordinates[0]).toHaveLength(3); // NaN is still typeof number
    expect(result.geometry.coordinates[1]).toEqual([20.09, 49.18, 1250]);
    expect(result.geometry.coordinates[2]).toHaveLength(2);
  });

  it('returns null when latlng is missing entirely (likely indoor activity)', () => {
    expect(buildGeoJSON(baseActivity, {})).toBeNull();
  });

  it('returns null when latlng.data is empty', () => {
    expect(buildGeoJSON(baseActivity, { latlng: { data: [] } })).toBeNull();
  });

  it('returns null when latlng.data is not an array (defensive)', () => {
    const malformed = { latlng: { data: 'not an array' } } as unknown as StravaStreams;
    expect(buildGeoJSON(baseActivity, malformed)).toBeNull();
  });

  it('copies activity meta into properties verbatim, with strava_activity_id as a number', () => {
    const props = buildGeoJSON(baseActivity, baseStreams)!.properties;
    expect(props.name).toBe('Granią');
    expect(props.sport_type).toBe('Hike');
    expect(props.start_date).toBe('2025-08-15T05:30:00Z');
    expect(props.distance).toBe(8430);
    expect(props.total_elevation_gain).toBe(920);
    expect(props.source).toBe('strava');
    expect(props.strava_activity_id).toBe(12345678);
    expect(typeof props.strava_activity_id).toBe('number');
  });

  it('omits distance and total_elevation_gain when the activity lacks them', () => {
    const minimal: StravaActivity = {
      id: 99,
      name: 'short',
      sport_type: 'Walk',
      start_date: '2025-01-01T00:00:00Z',
    };
    const props = buildGeoJSON(minimal, baseStreams)!.properties;
    expect(props).not.toHaveProperty('distance');
    expect(props).not.toHaveProperty('total_elevation_gain');
    // Mandatory fields still present
    expect(props.source).toBe('strava');
    expect(props.strava_activity_id).toBe(99);
  });
});
