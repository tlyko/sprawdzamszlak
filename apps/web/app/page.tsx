// This is the new app/page.tsx
'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';

export default function Home() {
  
  // We use useMemo to ensure the component only imports once
  const Map = useMemo(() => dynamic(
    () => import('@/components/TatraMap'), // Import our new map component
    { 
      loading: () => <p>Loading map...</p>, // Show this while the map component is loading
      ssr: false // THIS IS THE KEY: Disable Server Side Rendering for this component
    }
  ), []); // Empty dependency array

  return (
    <div>
      {/* This will be replaced by the map component, but only in the browser */}
      <Map />
    </div>
  );
}