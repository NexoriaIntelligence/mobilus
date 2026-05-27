import { useFleetStore } from '../stores/fleet-store';

export default function AlertPanel() {
  const alerts = useFleetStore((state) => state.alerts);
  const clearAlert = useFleetStore((state) => state.clearAlert);

  if (alerts.length === 0) return null;

  return (
    <div className="absolute top-4 right-4 w-80 max-h-96 overflow-y-auto space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`p-3 rounded shadow-lg text-white ${
            alert.severity === 'critical' ? 'bg-red-600' :
            alert.severity === 'high' ? 'bg-orange-600' :
            alert.severity === 'medium' ? 'bg-yellow-600' : 'bg-blue-600'
          }`}
        >
          <div className="flex justify-between items-start">
            <div>
              <div className="font-semibold capitalize">{alert.alertType.replace(/_/g, ' ')}</div>
              <div className="text-xs opacity-80">Vehicle: {alert.vehicleId}</div>
              <div className="text-xs opacity-60">
                {new Date(alert.timestamp).toLocaleTimeString()}
              </div>
            </div>
            <button
              onClick={() => clearAlert(alert.id)}
              className="text-white hover:text-gray-200"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
