import { useEffect } from 'react';
import { useFleetStore } from './stores/fleet-store';
import { useWebSocket } from './hooks/use-websocket';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import AlertPanel from './components/AlertPanel';

function App() {
  const { connect, disconnect } = useWebSocket();
  const vehicles = useFleetStore((state) => state.vehicles);

  useEffect(() => {
    connect('wss://realtime.mobilus.com');
    return () => disconnect();
  }, [connect, disconnect]);

  return (
    <div className="flex h-screen bg-gray-900">
      <Sidebar />
      <div className="flex-1 relative">
        <MapView vehicles={vehicles} />
        <AlertPanel />
      </div>
    </div>
  );
}

export default App;
