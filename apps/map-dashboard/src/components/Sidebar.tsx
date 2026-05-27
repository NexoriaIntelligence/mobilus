import { useFleetStore } from '../stores/fleet-store';

export default function Sidebar() {
  const vehicles = useFleetStore((state) => state.vehicles);
  const alerts = useFleetStore((state) => state.alerts);
  const selectVehicle = useFleetStore((state) => state.selectVehicle);

  const vehicleArray = Array.from(vehicles.values());
  const movingCount = vehicleArray.filter(v => v.status === 'moving').length;
  const idleCount = vehicleArray.filter(v => v.status === 'idle').length;
  const offlineCount = vehicleArray.filter(v => v.status === 'offline').length;

  return (
    <div className="w-80 bg-gray-800 text-white flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">Mobilus Fleet</h1>
        <p className="text-sm text-gray-400">Real-time Tracking</p>
      </div>
      
      <div className="p-4 grid grid-cols-3 gap-2 border-b border-gray-700">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-500">{movingCount}</div>
          <div className="text-xs text-gray-400">Moving</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-500">{idleCount}</div>
          <div className="text-xs text-gray-400">Idle</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-500">{offlineCount}</div>
          <div className="text-xs text-gray-400">Offline</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <h2 className="text-sm font-semibold text-gray-400 mb-2">Vehicles</h2>
        <div className="space-y-2">
          {vehicleArray.slice(0, 20).map((v) => (
            <div
              key={v.id}
              onClick={() => selectVehicle(v.id)}
              className="p-2 bg-gray-700 rounded cursor-pointer hover:bg-gray-600"
            >
              <div className="font-medium">{v.name || v.imei}</div>
              <div className="text-xs text-gray-400">
                {v.speed} km/h • {v.status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
