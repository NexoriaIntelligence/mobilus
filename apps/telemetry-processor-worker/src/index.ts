/**
 * Mobilus Telemetry Processor Worker
 * Heavy processing: Supabase writes, ThingBoard sync, alerts, geofences, broadcasts
 */

import { TelemetryEvent, RealtimeEvent, GeofenceEvent, AlertEvent } from '@mobilus/telemetry-types';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  THINGBOARD_API_URL: string;
  THINGBOARD_API_TOKEN: string;
  REALTIME_QUEUE: Queue<RealtimeEvent>;
  DLQ: Queue<TelemetryEvent>;
  ENVIRONMENT: string;
}

export default {
  async queue(batch: MessageBatch<TelemetryEvent>, env: Env): Promise<void> {
    const failedMessages: Array<{ message: Message<TelemetryEvent>; error: Error }> = [];

    for (const message of batch.messages) {
      try {
        await processTelemetry(message.body, env);
      } catch (error) {
        console.error('Failed to process telemetry:', error);
        failedMessages.push({ message, error: error as Error });
      }
    }

    // Retry failed messages or send to DLQ
    if (failedMessages.length > 0) {
      await handleFailures(failedMessages, env);
    }
  }
};

async function processTelemetry(event: TelemetryEvent, env: Env): Promise<void> {
  const tasks = [
    // 1. Write to Supabase
    writeToSupabase(event, env),
    
    // 2. Sync with ThingBoard
    syncWithThingBoard(event, env),
    
    // 3. Process alerts
    processAlerts(event, env),
    
    // 4. Check geofences
    checkGeofences(event, env),
    
    // 5. Broadcast realtime update
    broadcastRealtime(event, env)
  ];

  await Promise.all(tasks);

  // Mark as processed in Supabase
  await markAsProcessed(event.id, env);
}

async function writeToSupabase(event: TelemetryEvent, env: Env): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.warn('Supabase not configured');
    return;
  }

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/gps_tracking`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      id: event.id,
      imei: event.imei,
      timestamp: new Date(event.timestamp).toISOString(),
      lat: event.lat,
      lng: event.lng,
      speed: event.speed,
      heading: event.heading,
      ignition: event.ignition,
      fuel_level: event.fuelLevel,
      odometer: event.odometer,
      satellites: event.satellites,
      signal_strength: event.signalStrength,
      created_at: event.createdAt
    })
  });

  if (!response.ok) {
    throw new Error(`Supabase write failed: ${response.status}`);
  }
}

async function syncWithThingBoard(event: TelemetryEvent, env: Env): Promise<void> {
  if (!env.THINGBOARD_API_URL || !env.THINGBOARD_API_TOKEN) {
    console.warn('ThingBoard not configured');
    return;
  }

  // Get device by IMEI
  const deviceResponse = await fetch(`${env.THINGBOARD_API_URL}/api/devices/filter?deviceName=${event.imei}`, {
    headers: {
      'X-Authorization': `Bearer ${env.THINGBOARD_API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (!deviceResponse.ok) {
    return; // Device not found, skip sync
  }

  const devices = await deviceResponse.json();
  if (devices.length === 0) return;

  const deviceId = devices[0].id?.id;

  // Post telemetry data
  await fetch(`${env.THINGBOARD_API_URL}/api/v1/${deviceId}/telemetry`, {
    method: 'POST',
    headers: {
      'X-Authorization': `Bearer ${env.THINGBOARD_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ts: event.timestamp,
      values: {
        latitude: event.lat,
        longitude: event.lng,
        speed: event.speed,
        heading: event.heading,
        ignition: event.ignition ?? false,
        fuelLevel: event.fuelLevel ?? 0,
        satellites: event.satellites ?? 0,
        signalStrength: event.signalStrength ?? 0
      }
    })
  });
}

async function processAlerts(event: TelemetryEvent, env: Env): Promise<void> {
  const alerts: AlertEvent[] = [];

  // Check for overspeeding (threshold: 120 km/h)
  if (event.speed && event.speed > 120) {
    alerts.push({
      id: crypto.randomUUID(),
      alertType: 'overspeeding',
      vehicleId: event.imei,
      severity: 'high',
      timestamp: event.timestamp,
      data: { speed: event.speed, threshold: 120 }
    });
  }

  // Check for device disconnection (no updates for 5 minutes)
  // This would be handled by a separate monitoring job

  // Send alerts to realtime queue
  for (const alert of alerts) {
    await env.REALTIME_QUEUE.send({
      type: 'alert_created',
      vehicleId: event.imei,
      timestamp: Date.now(),
      data: alert
    });
  }
}

async function checkGeofences(event: TelemetryEvent, env: Env): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return;
  }

  // Query geofences that contain this position using PostGIS
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/check_geofences?lat=${event.lat}&lng=${event.lng}&vehicle_id=${event.imei}`,
    {
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`
      }
    }
  );

  if (!response.ok) {
    return;
  }

  const geofenceEvents = await response.json() as GeofenceEvent[];

  for (const geofenceEvent of geofenceEvents) {
    await env.REALTIME_QUEUE.send({
      type: geofenceEvent.eventType === 'enter' ? 'geofence_enter' : 'geofence_exit',
      vehicleId: event.imei,
      timestamp: event.timestamp,
      data: geofenceEvent
    });
  }
}

async function broadcastRealtime(event: TelemetryEvent, env: Env): Promise<void> {
  await env.REALTIME_QUEUE.send({
    type: 'vehicle_position',
    vehicleId: event.imei,
    timestamp: event.timestamp,
    data: {
      lat: event.lat,
      lng: event.lng,
      speed: event.speed,
      heading: event.heading,
      ignition: event.ignition
    }
  });
}

async function markAsProcessed(eventId: string, env: Env): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return;
  }

  await fetch(`${env.SUPABASE_URL}/rest/v1/gps_tracking?id=eq.${eventId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ processed: true })
  });
}

async function handleFailures(
  failures: Array<{ message: Message<TelemetryEvent>; error: Error }>,
  env: Env
): Promise<void> {
  for (const { message, error } of failures) {
    const retryCount = message.attempts ?? 0;

    if (retryCount >= 3) {
      // Send to dead letter queue
      await env.DLQ.send(message.body);
      console.error(`Message sent to DLQ after ${retryCount} attempts:`, error);
    } else {
      // Will be retried automatically by Cloudflare Queues
      throw error;
    }
  }
}
