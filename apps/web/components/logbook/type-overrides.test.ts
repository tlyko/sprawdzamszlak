// Tests for the per-trail type-override list. Small surface; the value
// here is locking the override entries in place — a future bulk-import
// rerun must not silently drop the owner reclassifications, and the
// short-circuit "skip allocation when nothing changed" branch matters
// for React reference equality downstream.

import { describe, expect, it } from 'vitest';

import { applyTypeOverrides } from './type-overrides';
import type { Trail } from '@/components/map/types';

const trail = (id: string, type: Trail['type']): Trail => ({
  id,
  name: id,
  type,
  geojson_url: 'https://example.invalid/x.geojson',
});

describe('applyTypeOverrides', () => {
  it('rewrites Rysy from off-piste (Strava heuristic default) to official', () => {
    const input = [trail('strava-12161135830', 'off-piste')];
    const out = applyTypeOverrides(input);
    expect(out[0]?.type).toBe('official');
  });

  it('returns the SAME array reference when no override hits', () => {
    const input = [
      trail('strava-not-overridden', 'off-piste'),
      trail('strava-also-not', 'walk'),
    ];
    const out = applyTypeOverrides(input);
    // Reference equality — important so React's downstream effects
    // don't re-run on every render of the manifest.
    expect(out).toBe(input);
  });

  it('returns a NEW array when at least one entry is rewritten', () => {
    const input = [
      trail('strava-12161135830', 'off-piste'), // overridden → official
      trail('strava-other', 'walk'),
    ];
    const out = applyTypeOverrides(input);
    expect(out).not.toBe(input);
    expect(out[0]?.type).toBe('official');
    expect(out[1]).toBe(input[1]); // untouched entry is kept by-reference
  });

  it('skips override when current type already equals the target (idempotent)', () => {
    const input = [trail('strava-12161135830', 'official')];
    const out = applyTypeOverrides(input);
    expect(out).toBe(input);
  });

  it('preserves order', () => {
    const input = [
      trail('strava-other', 'walk'),
      trail('strava-12161135830', 'off-piste'),
      trail('strava-third', 'climbing'),
    ];
    const out = applyTypeOverrides(input);
    expect(out.map((t) => t.id)).toEqual([
      'strava-other',
      'strava-12161135830',
      'strava-third',
    ]);
  });

  it('handles an empty manifest', () => {
    expect(applyTypeOverrides([])).toEqual([]);
  });

  it('does not touch unrelated fields on the rewritten trail', () => {
    const original = trail('strava-12161135830', 'off-piste');
    const out = applyTypeOverrides([original]);
    expect(out[0]?.id).toBe(original.id);
    expect(out[0]?.name).toBe(original.name);
    expect(out[0]?.geojson_url).toBe(original.geojson_url);
  });
});
