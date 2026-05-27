import { useCallback, useRef } from 'react';
import { useFleetStore } from '../stores/fleet-store';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const updateVehicle = useFleetStore((state) => state.updateVehicle);
  const addAlert = useFleetStore((state) => state.addAlert);

  const connect = useCallback((url: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      // Subscribe to global alerts
      ws.send(JSON.stringify({ type: 'subscribe', roomId: 'alerts:global' }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'vehicle_position':
            updateVehicle({
              id: data.vehicleId,
              lat: data.data.lat,
              lng: data.data.lng,
              speed: data.data.speed,
              heading: data.data.heading,
              ignition: data.data.ignition,
              lastUpdate: new Date(data.timestamp).toISOString(),
              status: (data.data.speed || 0) > 0 ? 'moving' : 'idle'
            });
            break;
            
          case 'alert_created':
          case 'overspeeding':
          case 'harsh_braking':
            addAlert({
              id: crypto.randomUUID(),
              alertType: data.type,
              vehicleId: data.vehicleId,
              severity: data.data.severity || 'medium',
              timestamp: data.timestamp,
              data: data.data
            });
            break;
            
          case 'ping':
            ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
            break;
        }
      } catch (err) {
        console.error('Error processing message:', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      setTimeout(() => connect(url), 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    wsRef.current = ws;
  }, [updateVehicle, addAlert]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const subscribe = useCallback((roomId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', roomId }));
    }
  }, []);

  const unsubscribe = useCallback((roomId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', roomId }));
    }
  }, []);

  return { connect, disconnect, subscribe, unsubscribe };
}
