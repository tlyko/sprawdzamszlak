// Tests for the trail-name → peak match (logbook row → summit altitude
// rendering). Diacritic-insensitive + alias-aware ("Wysoka (Vysoká)"
// matches both forms).

import { describe, expect, it } from 'vitest';

import { findPeakByTrailName } from './match-peak';
import type { Peak, Trail } from '@/components/map/types';

const peak = (id: string, nazwa: string, height = 2500): Peak => ({
  id,
  nazwa,
  latitude: 49.18,
  longitude: 20.09,
  height,
});

const trail = (name: string): Trail => ({
  id: `strava-${name.toLowerCase().replace(/\W+/g, '-')}`,
  name,
  type: 'off-piste',
  geojson_url: 'https://example.invalid/x.geojson',
});

describe('findPeakByTrailName', () => {
  it('matches the Polish form verbatim', () => {
    const peaks = [peak('rysy', 'Rysy', 2501)];
    expect(findPeakByTrailName(trail('Rysy'), peaks)?.id).toBe('rysy');
  });

  it('matches case-insensitively', () => {
    const peaks = [peak('rysy', 'Rysy', 2501)];
    expect(findPeakByTrailName(trail('rysy'), peaks)?.id).toBe('rysy');
    expect(findPeakByTrailName(trail('RYSY'), peaks)?.id).toBe('rysy');
  });

  it('matches the Slovak alias when the seed has "Polish (Slovak)"', () => {
    const peaks = [peak('wysoka', 'Wysoka (Vysoká)')];
    expect(findPeakByTrailName(trail('Vysoká'), peaks)?.id).toBe('wysoka');
    expect(findPeakByTrailName(trail('Wysoka'), peaks)?.id).toBe('wysoka');
  });

  it('matches without diacritics (Strava drops them frequently)', () => {
    const peaks = [peak('wysoka', 'Wysoka (Vysoká)')];
    expect(findPeakByTrailName(trail('Vysoka'), peaks)?.id).toBe('wysoka');
    expect(findPeakByTrailName(trail('vysoka'), peaks)?.id).toBe('wysoka');
  });

  it('matches Polish diacritics symmetrically', () => {
    const peaks = [peak('konczysta', 'Kończysta')];
    expect(findPeakByTrailName(trail('Konczysta'), peaks)?.id).toBe('konczysta');
    expect(findPeakByTrailName(trail('Kończysta'), peaks)?.id).toBe('konczysta');
  });

  it('returns null when no peak matches', () => {
    const peaks = [peak('rysy', 'Rysy'), peak('krywan', 'Krywań')];
    expect(findPeakByTrailName(trail('Dolina 5 stawów'), peaks)).toBeNull();
  });

  it('returns null on an empty trail name', () => {
    const peaks = [peak('rysy', 'Rysy')];
    expect(findPeakByTrailName(trail(''), peaks)).toBeNull();
  });

  it('does NOT match on a substring (avoids over-matching suffixed trails)', () => {
    // The doc-comment says: "substring fallback for 'Krywań — droga …' style
    // suffixed names is intentionally NOT done because it would over-match
    // on ambiguous trails." Lock that behaviour in.
    const peaks = [peak('krywan', 'Krywań (Kriváň)')];
    expect(findPeakByTrailName(trail('Krywań — droga klasyczna'), peaks)).toBeNull();
  });

  it('handles whitespace around the alias parens', () => {
    const peaks = [peak('rysy', '  Rysy  (  Rysy  )  ')];
    expect(findPeakByTrailName(trail('Rysy'), peaks)?.id).toBe('rysy');
  });

  it('returns the first matching peak when several aliases collide', () => {
    // Defensive: shouldn't happen in production data (peak names are unique),
    // but test that the helper is deterministic if it does.
    const peaks = [
      peak('first', 'Test Peak'),
      peak('second', 'Test Peak'),
    ];
    expect(findPeakByTrailName(trail('Test Peak'), peaks)?.id).toBe('first');
  });
});
