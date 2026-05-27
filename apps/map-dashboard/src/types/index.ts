export interface Vehicle {
  id: string;
  imei: string;
  name: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  status: 'moving' | 'idle' | 'offline';
  ignition: boolean;
  fuelLevel?: number;
  odometer: number;
  lastUpdate: string;
}

export interface RealtimeEvent {
  type: EventType;
  vehicleId: string;
  agencyId?: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export type EventType =
  | 'vehicle_position'
  | 'alert_created'
  | 'geofence_enter'
  | 'geofence_exit'
  | 'harsh_braking'
  | 'overspeeding'
  | 'trip_started'
  | 'trip_ended'
  | 'driver_online'
  | 'driver_offline';

export interface Alert {
  id: string;
  alertType: string;
  vehicleId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  data: Record<string, unknown>;
}

export interface Geofence {
  id: string;
  name: string;
  type: 'polygon' | 'circle';
  coordinates: [number, number][] | { center: [number, number]; radius: number };
}
