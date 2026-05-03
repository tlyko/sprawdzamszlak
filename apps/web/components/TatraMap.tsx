// This is components/TatraMap.tsx
'use client'; 

import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Layer } from 'leaflet';

// Your working AWS API Gateway URL (base path)
const AWS_API_URL_BASE = "https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod"; 

// --- Define Interfaces ---
interface Peak {
  id: string;
  nazwa: string;
  trudnosc: string;
  latitude?: number;
  longitude?: number;
  height?: number;
}

interface Trail {
  id: string;
  name: string;
  type: 'official' | 'off-piste';
  geojson_url: string;
}

// --- Define Trail Styles ---
const trailStyles = {
  'off-piste': {
    color: '#007bff', // Blue
    weight: 2,
    opacity: 0.8,
    dashArray: '5, 10', // Dotted line
  },
  // NEW: Style for hovering over a trail
  'off-piste-hover': {
    color: '#0056b3', // Darker Blue
    weight: 4,
    opacity: 1,
    dashArray: '', // Solid line on hover
  },
  default: {
    color: 'gray',
    weight: 2,
  }
};

const getTrailStyle = (trail: Trail) => {
  if (trail.type === 'off-piste') return trailStyles['off-piste'];
  return trailStyles.default;
};


// --- Map Components (Unchanged) ---
interface MapZoomHandlerProps { setZoom: Dispatch<SetStateAction<number>>; }
function MapZoomHandler({ setZoom }: MapZoomHandlerProps) {
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()), load: () => setZoom(map.getZoom()) });
  return null;
}
const peakStyle = { color: 'black', weight: 1, fillColor: 'white', fillOpacity: 1.0 };


// --- Main Component ---
export default function TatraMap() {
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [zoom, setZoom] = useState(11);
  const [trailManifest, setTrailManifest] = useState<Trail[]>([]);
  const [trailGeoData, setTrailGeoData] = useState<any[]>([]);

  const MIN_ZOOM_TO_SHOW_PEAKS = 12;

  // Fetching data (Unchanged)
  useEffect(() => {
    async function fetchAllData() {
      try {
        const peaksResponse = await fetch(`${AWS_API_URL_BASE}/`); 
        if (!peaksResponse.ok) { throw new Error(`Failed to fetch peaks: ${peaksResponse.statusText}`); }
        const peaksData: Peak[] = await peaksResponse.json();
        const peaksWithCoords = peaksData.filter(p => p.latitude && p.longitude);
        setPeaks(peaksWithCoords);

        const routesResponse = await fetch(`${AWS_API_URL_BASE}/routes`); 
        if (!routesResponse.ok) { throw new Error(`Failed to fetch routes: ${routesResponse.statusText}`); }
        const routesData: Trail[] = await routesResponse.json(); 
        setTrailManifest(routesData);
      } catch (error) {
        console.error("Failed to fetch manifest:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchAllData();
  }, []);

  // Fetching GeoJSON (Unchanged)
  useEffect(() => {
    if (!Array.isArray(trailManifest) || trailManifest.length === 0) return;
    async function fetchAllGeoJson() {
      console.log(`Fetching ${trailManifest.length} GeoJSON files...`);
      const promises = trailManifest.map(trail => 
        fetch(trail.geojson_url)
          .then(res => {
            if (!res.ok) { throw new Error(`Failed to fetch ${trail.geojson_url}: ${res.statusText}`); }
            return res.json();
          })
      );
      try {
        const allGeoJsonData = await Promise.all(promises);
        setTrailGeoData(allGeoJsonData);
        console.log("Successfully loaded all GeoJSON data");
      } catch (error) {
        console.error("Error fetching one or more GeoJSON files:", error);
      }
    }
    fetchAllGeoJson();
  }, [trailManifest]); 


  if (isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center">
        <p>Loading map, peaks, and trails...</p>
      </main>
    );
  }

  return (
    <main>
      <MapContainer 
        center={[49.23, 20.00]}
        zoom={11} 
        scrollWheelZoom={true} 
        style={{ height: '100vh', width: '100wh' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapZoomHandler setZoom={setZoom} />

        {/* --- MODIFIED: Render all loaded GeoJSON trails --- */}
        {trailGeoData.map((geoJson, index) => {
          const trailInfo = trailManifest[index];
          if (!trailInfo) return null;

          const onEachFeature = (_feature: unknown, layer: Layer) => {
            // bindPopup with a DOM element (not a raw HTML string) so that
            // trailInfo.name is set via textContent and never interpreted as HTML.
            const container = document.createElement('div');

            const heading = document.createElement('h3');
            heading.style.cssText = 'font-size:1.2rem;font-weight:bold;margin:0;padding-bottom:5px;';
            heading.textContent = trailInfo.name;

            const typeLine = document.createElement('p');
            typeLine.style.margin = '0';
            typeLine.textContent = `Typ: ${trailInfo.type === 'off-piste' ? 'Pozaszlakowy' : 'Oficjalny'}`;

            container.append(heading, typeLine);
            layer.bindPopup(container);

            // 2. Add hover events
            layer.on({
              mouseover: (e) => {
                // Set the "hover" style
                e.target.setStyle(trailStyles['off-piste-hover']);
                e.target.bringToFront(); // Bring trail to front on hover
              },
              mouseout: (e) => {
                // Reset to the original style
                e.target.setStyle(getTrailStyle(trailInfo));
              }
            });
          };

          return (
            <GeoJSON 
              key={trailInfo.id} 
              data={geoJson} 
              style={getTrailStyle(trailInfo)}
              // NEW: Attach the event handler
              onEachFeature={onEachFeature} 
            />
          );
        })}

        {/* Render peaks (unchanged) */}
        {zoom > MIN_ZOOM_TO_SHOW_PEAKS && peaks.map(peak => (
          <CircleMarker 
            key={peak.id} 
            center={[peak.latitude!, peak.longitude!]}
            radius={6} 
            pathOptions={peakStyle} 
          >
            <Popup>
              <div style={{ padding: '5px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{peak.nazwa} ({peak.height || 'N/A'}m)</h3>
                <p><strong>Trudność:</strong> {peak.trudnosc}</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Helper message (unchanged) */}
        {zoom <= MIN_ZOOM_TO_SHOW_PEAKS && (
          <div style={{
            position: 'absolute', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)', 
            padding: '10px', 
            backgroundColor: 'rgba(255, 255, 255, 0.8)', 
            borderRadius: '5px', 
            zIndex: 1000,
            pointerEvents: 'none',
            color: 'black'
          }}>
            Przybliż mapę, aby zobaczyć szczyty
          </div>
        )}
      </MapContainer>
    </main>
  );
}