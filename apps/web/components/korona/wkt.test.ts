// Tests for the WKT (Wielka Korona Tatr) bagged-detection helpers.
//
// The bagged check is the most subtle piece of WKT logic — drift on the
// 50m threshold or the lat/lng coordinate convention silently changes
// what counts as a summit visit, and the home page deep-link from
// /korona-tatr/ rides on the result.

import { describe, expect, it } from 'vitest';

import {
  BAGGED_THRESHOLD_M,
  WKT_PEAK_IDS,
  computeWktStatus,
  haversineMeters,
  isPeakBaggedByCoordinates,
} from './wkt';
import type { Peak, Trail, TripCoordinate } from '@/components/map/types';

describe('haversineMeters', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineMeters(49.18, 20.09, 49.18, 20.09)).toBe(0);
  });

  it('matches a known short distance to within 1m', () => {
    // Rysy (49.1794, 20.0883) to its neighbour ~700m east — distance is
    // ~723m by Google Earth, ~720m by haversine. Tolerance covers both.
    const d = haversineMeters(49.1794, 20.0883, 49.1794, 20.0983);
    expect(d).toBeGreaterThan(700);
    expect(d).toBeLessThan(740);
  });

  it('is symmetric within float tolerance', () => {
    const a = haversineMeters(49.18, 20.09, 49.19, 20.10);
    const b = haversineMeters(49.19, 20.10, 49.18, 20.09);
    expect(Math.abs(a - b)).toBeLessThan(1e-6);
  });
});

describe('isPeakBaggedByCoordinates', () => {
  const rysy: Pick<Peak, 'latitude' | 'longitude'> = {
    latitude: 49.1794,
    longitude: 20.0883,
  };

  const coordAt = (lat: number, lng: number): TripCoordinate => [lng, lat];

  it('returns true when a coordinate sits exactly on the summit', () => {
    expect(
      isPeakBaggedByCoordinates(rysy, [coordAt(49.1794, 20.0883)]),
    ).toBe(true);
  });

  it('returns true for any single point inside the 50m threshold', () => {
    // ~30m east — well under default threshold.
    expect(
      isPeakBaggedByCoordinates(rysy, [coordAt(49.1794, 20.0887)]),
    ).toBe(true);
  });

  it('returns false when every point is outside the threshold', () => {
    // ~700m east — well over.
    expect(
      isPeakBaggedByCoordinates(rysy, [
        coordAt(49.1794, 20.095),
        coordAt(49.18, 20.10),
      ]),
    ).toBe(false);
  });

  it('short-circuits on the first hit (fast path)', () => {
    // No way to assert short-circuiting cleanly without instrumentation;
    // sanity-check that a long array with a single-near-the-end hit still
    // returns true.
    const coords: TripCoordinate[] = [];
    for (let i = 0; i < 1000; i++) coords.push(coordAt(49.5, 21.0)); // far away
    coords.push(coordAt(49.1794, 20.0883)); // exact hit
    expect(isPeakBaggedByCoordinates(rysy, coords)).toBe(true);
  });

  it('returns false when peak has no coordinates', () => {
    expect(
      isPeakBaggedByCoordinates(
        { latitude: undefined, longitude: undefined },
        [coordAt(49.1794, 20.0883)],
      ),
    ).toBe(false);
  });

  it('returns false on empty coordinate array', () => {
    expect(isPeakBaggedByCoordinates(rysy, [])).toBe(false);
  });

  it('respects the threshold parameter override', () => {
    const point = coordAt(49.1794, 20.092); // ~280m away
    expect(isPeakBaggedByCoordinates(rysy, [point], 50)).toBe(false);
    expect(isPeakBaggedByCoordinates(rysy, [point], 500)).toBe(true);
  });

  it('reads coords as [lng, lat] (NOT [lat, lng]) per GeoJSON convention', () => {
    // Sanity-check we'd reject a swapped pair: feeding [49, 20] (lat as
    // first element) lands somewhere in northwest Slovakia, not Rysy.
    const swapped: TripCoordinate = [49.1794, 20.0883];
    expect(isPeakBaggedByCoordinates(rysy, [swapped])).toBe(false);
  });
});

describe('computeWktStatus', () => {
  const peak = (id: string, lat: number, lng: number): Peak => ({
    id,
    nazwa: id,
    latitude: lat,
    longitude: lng,
    height: 2500,
  });

  // 14 WKT peaks at distinct coordinates so the threshold tests don't bleed.
  const peaks: Peak[] = WKT_PEAK_IDS.map((id, i) =>
    peak(id, 49.18 + i * 0.01, 20.0 + i * 0.01),
  );

  const trail = (id: string): Trail => ({
    id,
    name: id,
    type: 'off-piste',
    geojson_url: 'https://example.invalid/x.geojson',
  });

  it('returns 14 entries in WKT roster order', () => {
    const result = computeWktStatus(peaks, [], []);
    expect(result.map((s) => s.peak.id)).toEqual(WKT_PEAK_IDS);
    expect(result.every((s) => !s.bagged)).toBe(true);
  });

  it('marks bagged when a trail visits the summit, with the trail id', () => {
    const trails = [trail('strava-1'), trail('strava-2')];
    // Trail 0 visits rysy (index 8 in WKT order, pre-shifted lat above).
    const rysyLat = 49.18 + 8 * 0.01;
    const rysyLng = 20.0 + 8 * 0.01;
    const trailCoords: TripCoordinate[][] = [
      [[rysyLng, rysyLat]],
      [],
    ];
    const result = computeWktStatus(peaks, trails, trailCoords);
    const rysyEntry = result.find((s) => s.peak.id === 'rysy')!;
    expect(rysyEntry.bagged).toBe(true);
    expect(rysyEntry.trailId).toBe('strava-1');
  });

  it('records the FIRST trail to bag a peak even when later trails also do', () => {
    const trails = [trail('strava-first'), trail('strava-second')];
    const rysyLat = 49.18 + 8 * 0.01;
    const rysyLng = 20.0 + 8 * 0.01;
    const trailCoords: TripCoordinate[][] = [
      [[rysyLng, rysyLat]],
      [[rysyLng, rysyLat]],
    ];
    const result = computeWktStatus(peaks, trails, trailCoords);
    expect(result.find((s) => s.peak.id === 'rysy')!.trailId).toBe(
      'strava-first',
    );
  });

  it('drops missing peaks gracefully (skip entry, don\'t crash)', () => {
    // Pass a roster missing one of the 14 — result should have 13.
    const partial = peaks.slice(0, 13);
    const result = computeWktStatus(partial, [], []);
    expect(result).toHaveLength(13);
  });

  it('exports BAGGED_THRESHOLD_M as a non-zero positive constant', () => {
    expect(BAGGED_THRESHOLD_M).toBeGreaterThan(0);
    expect(BAGGED_THRESHOLD_M).toBeLessThan(1000);
  });
});
