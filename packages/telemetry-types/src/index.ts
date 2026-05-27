/**
 * Mobilus Telemetry Types
 * Shared type definitions for the entire platform
 */

export interface NormalizedTelemetry {
  imei?: string;
  timestamp: number;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  ignition?: boolean;
  fuelLevel?: number;
  odometer?: number;
  satellites?: number;
  signalStrength?: number;
  altitude?: number;
  inputs?: Record<string, boolean>;
  outputs?: Record<string, boolean>;
  raw?: Record<string, unknown>;
}

export interface HandshakeResult {
  imei: string;
  remaining?: Buffer;
}

export interface PacketResult {
  valid: boolean;
  requiresAck: boolean;
  telemetry?: NormalizedTelemetry;
  consumedBytes: number;
}

export interface TelemetryEvent {
  id: string;
  imei: string;
  protocol: string;
  timestamp: number;
  receivedAt: number;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  ignition?: boolean;
  fuelLevel?: number;
  odometer?: number;
  satellites?: number;
  signalStrength?: number;
  processed: boolean;
  createdAt: string;
}

export interface DeviceSession {
  imei: string;
  protocol: string;
  connectedAt: number;
  lastHeartbeat: number;
  packetCount: number;
}

export interface RealtimeEvent {
  type: RealtimeEventType;
  vehicleId: string;
  agencyId?: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export type RealtimeEventType =
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

export interface GeofenceEvent {
  id: string;
  geofenceId: string;
  vehicleId: string;
  eventType: 'enter' | 'exit' | 'dwell';
  timestamp: number;
  lat: number;
  lng: number;
}

export interface AlertEvent {
  id: string;
  alertType: AlertType;
  vehicleId: string;
  driverId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  resolvedAt?: number;
  data: Record<string, unknown>;
}

export type AlertType =
  | 'overspeeding'
  | 'harsh_braking'
  | 'rapid_acceleration'
  | 'unsafe_cornering'
  | 'excessive_idle'
  | 'geofence_violation'
  | 'maintenance_due'
  | 'device_disconnected';

export interface DriverBehaviorScore {
  driverId: string;
  periodStart: string;
  periodEnd: string;
  overallScore: number;
  speedingScore: number;
  brakingScore: number;
  accelerationScore: number;
  corneringScore: number;
  idleScore: number;
  events: Array<{
    type: AlertType;
    timestamp: number;
    severity: number;
  }>;
}

export interface VehicleStatus {
  vehicleId: string;
  imei: string;
  lastPosition: {
    lat: number;
    lng: number;
    timestamp: number;
    speed: number;
    heading: number;
  };
  status: 'moving' | 'idle' | 'offline';
  ignition: boolean;
  fuelLevel?: number;
  odometer: number;
  lastUpdate: string;
}
