// This is components/TatraMap.tsx
'use client'; // IMPORTANT: Leaflet maps only work in the browser

import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css'; // Import styles for the map
import L from 'leaflet'; // Import leaflet to fix the icon

// Paste your working AWS API Gateway URL here
const AWS_API_URL = "https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/"; // Make sure it has the trailing slash!

// --- Fix for the default Leaflet icon ---
const defaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;
// --- End of icon fix ---


// Define what our Peak data looks like (TypeScript)
interface Peak {
  id: string;
  nazwa: string;
  trudnosc: string;
  latitude?: number;
  longitude?: number;
  height?: number;
}

// IMPORTANT: We changed the function name from Home to TatraMap
export default function TatraMap() {
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch data from your AWS Worker when the page loads
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
      <main className="flex min-h-screen flex-col items-center justify-center">
        <p>Loading map and peak data...</p>
      </main>
    );
  }

  return (
    <main>
      <MapContainer 
        center={[49.23, 20.00]} // Center of Tatra Mountains
        zoom={11} // Zoom level
        scrollWheelZoom={true} 
        style={{ height: '100vh', width: '100wh' }} // Map full screen
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {peaks.map(peak => (
          <Marker 
            key={peak.id} 
            position={[peak.latitude!, peak.longitude!]}
          >
            <Popup>
              <div style={{ padding: '5px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{peak.nazwa} ({peak.height || 'N/A'}m)</h3>
                <p><strong>Trudność:</strong> {peak.trudnosc}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </main>
  );
}