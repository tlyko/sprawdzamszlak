// This is components/TatraMap.tsx
'use client'; 

// --- CHANGE 1: Import type definitions for state setters ---
import { useState, useEffect, Dispatch, SetStateAction } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Your working AWS API Gateway URL
const AWS_API_URL = "https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/"; // Make sure it has the trailing slash!

// Define what our Peak data looks like (TypeScript)
interface Peak {
  id: string;
  nazwa: string;
  trudnosc: string; // I see 'trudnosc' in your test data, so I am using this.
  latitude?: number;
  longitude?: number;
  height?: number;
}

// --- NEW: Define the types for our handler's props ---
interface MapZoomHandlerProps {
  setZoom: Dispatch<SetStateAction<number>>;
}

// This component will listen to map events
// --- CHANGE 2: Apply the type to the component's props ---
function MapZoomHandler({ setZoom }: MapZoomHandlerProps) {
  const map = useMapEvents({
    // Fired when the user finishes zooming
    zoomend: () => {
      setZoom(map.getZoom());
    },
    // Fired when the map first loads
    load: () => {
      setZoom(map.getZoom());
    }
  });
  return null; // This component renders nothing
}

// NEW STYLE: White circle with a thin black border
const peakStyle = {
  color: 'black',       // Border color
  weight: 1,            // Border width in pixels
  fillColor: 'white',   // Fill color
  fillOpacity: 1.0,     // Solid fill
};

export default function TatraMap() {
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Set initial zoom to match the map
  const [zoom, setZoom] = useState(11); 

  // CHANGE: Peaks will now only appear at zoom 12 and higher
  const MIN_ZOOM_TO_SHOW_PEAKS = 12;

  // Fetching data (this code is unchanged)
  useEffect(() => {
    async function fetchPeaks() {
      try {
        const response = await fetch(AWS_API_URL);
        const data: Peak[] = await response.json();
        const peaksWithCoords = data.filter(p => p.latitude && p.longitude);
        setPeaks(peaksWithCoords);
      } catch (error) {
        console.error("Failed to fetch peaks:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchPeaks();
  }, []);

  if (isLoading) {
    return (
      // --- THIS WAS THE FIX: Added missing '<' ---
      <main className="flex min-h-screen flex-col items-center justify-center">
        <p>Loading map and peak data...</p>
      </main>
    );
  }

  return (
    <main>
      <MapContainer 
        center={[49.23, 20.00]}
        zoom={11} // Initial zoom
        scrollWheelZoom={true} 
        style={{ height: '100vh', width: '100wh' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Add our zoom handler component inside the map */}
        <MapZoomHandler setZoom={setZoom} />

        {/* Conditionally render peaks only if zoom is high enough */}
        {zoom > MIN_ZOOM_TO_SHOW_PEAKS && peaks.map(peak => (
          // Use CircleMarker instead of Marker
          <CircleMarker 
            key={peak.id} 
            center={[peak.latitude!, peak.longitude!]}
            radius={6} // Size in pixels
            pathOptions={peakStyle} // Apply our new white style
          >
            <Popup>
              {/* Popup code is unchanged */}
              <div style={{ padding: '5px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{peak.nazwa} ({peak.height || 'N/A'}m)</h3>
                <p><strong>Trudność:</strong> {peak.trudnosc}</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Show a helper message if user is zoomed out */}
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
            color: 'black' // Make sure text is visible
          }}>
            Przybliż mapę, aby zobaczyć szczyty
          </div>
        )}

      </MapContainer>
    </main>
  );
}