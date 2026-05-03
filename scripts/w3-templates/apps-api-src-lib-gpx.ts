// GPX → GeoJSON conversion using @tmcw/togeojson + @xmldom/xmldom shim.
//
// Conversion rules (per ADR-004):
//   - merge multiple <trk>/<trkseg> into a single LineString
//   - preserve elevation in coordinates as third element when present
//   - drop time, heart rate, cadence, extensions, waypoints
//   - throw if result has fewer than 2 points

import { gpx as togeoJsonGpx } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import type { FeatureCollection, LineString, Position } from 'geojson';

export interface GpxConversion {
  geojson: FeatureCollection<LineString>;
  pointCount: number;
}

export function convertGpxToGeoJson(rawGpx: string): GpxConversion {
  let xmlDoc: unknown;
  try {
    xmlDoc = new DOMParser().parseFromString(rawGpx, 'application/xml');
  } catch (err) {
    throw new Error(`GPX parse failed: ${(err as Error).message}`);
  }

  // togeojson is typed against the browser DOM `Document`; xmldom is
  // API-compatible at runtime but the types don't unify.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fc = togeoJsonGpx(xmlDoc as any) as FeatureCollection;
  if (!fc || !fc.features || fc.features.length === 0) {
    throw new Error('GPX has no features');
  }

  // Collect all LineString coordinates from track features.
  const allCoords: Position[] = [];
  for (const feat of fc.features) {
    const geom = feat.geometry;
    if (!geom) continue;
    if (geom.type === 'LineString') {
      allCoords.push(...geom.coordinates);
    } else if (geom.type === 'MultiLineString') {
      for (const seg of geom.coordinates) {
        allCoords.push(...seg);
      }
    }
    // Points (waypoints) are ignored per ADR-004.
  }

  if (allCoords.length < 2) {
    throw new Error('GPX track has fewer than 2 points');
  }

  // Strip time-series properties; keep only [lon, lat, ele?].
  const cleanedCoords: Position[] = allCoords.map((c) => {
    const [lon, lat, ele] = c;
    if (lon === undefined || lat === undefined) {
      throw new Error('GPX coordinate missing lon or lat');
    }
    return ele !== undefined ? [lon, lat, ele] : [lon, lat];
  });

  return {
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: cleanedCoords },
        },
      ],
    },
    pointCount: cleanedCoords.length,
  };
}
