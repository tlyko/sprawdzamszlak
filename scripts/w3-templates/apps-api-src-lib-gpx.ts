// GPX → GeoJSON conversion using @tmcw/togeojson + @xmldom/xmldom shim.
//
// Conversion rules (per ADR-004):
//   - merge multiple <trk>/<trkseg> into a single LineString
//   - preserve elevation in coordinates as third element when present
//   - drop time, heart rate, cadence, extensions, waypoints
//   - throw if result has fewer than 2 points

import { gpx as togeoJsonGpx } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';

export interface GpxConversion {
  geojson: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  pointCount: number;
}

export function convertGpxToGeoJson(rawGpx: string): GpxConversion {
  let xmlDoc: Document;
  try {
    xmlDoc = new DOMParser({
      errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} },
    }).parseFromString(rawGpx, 'application/xml') as unknown as Document;
  } catch (err) {
    throw new Error(`GPX parse failed: ${(err as Error).message}`);
  }

  const fc = togeoJsonGpx(xmlDoc) as GeoJSON.FeatureCollection;
  if (!fc || !fc.features || fc.features.length === 0) {
    throw new Error('GPX has no features');
  }

  // Collect all LineString coordinates from track features.
  const allCoords: GeoJSON.Position[] = [];
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

  // Strip time-series properties; keep only coordinates.
  const cleanedCoords = allCoords.map((c) => {
    if (c.length >= 3) return [c[0], c[1], c[2]];
    return [c[0], c[1]];
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
