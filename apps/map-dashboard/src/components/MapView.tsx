import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Vehicle } from '../types';

interface MapViewProps {
  vehicles: Map<string, Vehicle>;
}

export default function MapView({ vehicles }: MapViewProps) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  useEffect(() => {
    mapRef.current = new maplibregl.Map({
      container: 'map',
      style: 'https://demotiles.maplibre.org/style.json',
      center: [0, 30],
      zoom: 2
    });

    return () => {
      mapRef.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    const existingIds = new Set(vehicles.keys());
    
    // Remove markers for vehicles that no longer exist
    markersRef.current.forEach((marker, id) => {
      if (!existingIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Update or create markers
    vehicles.forEach((vehicle, id) => {
      let marker = markersRef.current.get(id);
      
      const color = vehicle.status === 'moving' ? '#22c55e' : 
                    vehicle.status === 'idle' ? '#f59e0b' : '#ef4444';

      if (marker) {
        marker.setLngLat([vehicle.lng, vehicle.lat]);
      } else {
        const el = document.createElement('div');
        el.className = 'vehicle-marker';
        el.style.cssText = `
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${color};
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          cursor: pointer;
        `;
        el.onclick = () => console.log('Vehicle clicked:', id);

        marker = new maplibregl.Marker({ element: el })
          .setLngLat([vehicle.lng, vehicle.lat])
          .addTo(mapRef.current!);
        
        markersRef.current.set(id, marker);
      }
    });
  }, [vehicles]);

  return <div id="map" className="w-full h-full" />;
}
