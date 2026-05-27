/**
 * Mobilus Telemetry Ingestion Worker
 * Lightweight Cloudflare Worker for telemetry validation and queue publishing
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { NormalizedTelemetry, TelemetryEvent } from '@mobilus/telemetry-types';

interface Env {
  TELEMETRY_QUEUE: Queue<TelemetryEvent>;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('/*', cors());

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'healthy', environment: c.env.ENVIRONMENT });
});

// Readiness check
app.get('/ready', (c) => {
  return c.json({ ready: true });
});

// Main ingestion endpoint
app.post('/api/ingest', async (c) => {
  try {
    const body = await c.req.json();
    const telemetryArray = Array.isArray(body.telemetry) ? body.telemetry : [body.telemetry];

    const events: TelemetryEvent[] = [];

    for (const t of telemetryArray as NormalizedTelemetry[]) {
      // Validate required fields
      if (!t.imei || !t.timestamp || typeof t.lat !== 'number' || typeof t.lng !== 'number') {
        continue;
      }

      // Normalize and validate
      const event: TelemetryEvent = {
        id: crypto.randomUUID(),
        imei: t.imei,
        protocol: t.protocol || 'unknown',
        timestamp: t.timestamp,
        receivedAt: Date.now(),
        lat: validateCoordinate(t.lat, -90, 90),
        lng: validateCoordinate(t.lng, -180, 180),
        speed: t.speed || 0,
        heading: t.heading || 0,
        ignition: t.ignition,
        fuelLevel: t.fuelLevel,
        odometer: t.odometer,
        satellites: t.satellites,
        signalStrength: t.signalStrength,
        processed: false,
        createdAt: new Date().toISOString()
      };

      events.push(event);
    }

    if (events.length === 0) {
      return c.json({ error: 'No valid telemetry events' }, 400);
    }

    // Batch send to queue
    for (const event of events) {
      await c.env.TELEMETRY_QUEUE.send(event);
    }

    return c.json({
      success: true,
      accepted: events.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Ingestion error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Bulk ingestion endpoint
app.post('/api/ingest/bulk', async (c) => {
  try {
    const body = await c.req.json();
    
    if (!Array.isArray(body.events)) {
      return c.json({ error: 'Expected array of events' }, 400);
    }

    const validEvents: TelemetryEvent[] = [];

    for (const t of body.events) {
      if (!t.imei || !t.timestamp) continue;

      const event: TelemetryEvent = {
        id: crypto.randomUUID(),
        imei: t.imei,
        protocol: t.protocol || 'unknown',
        timestamp: t.timestamp,
        receivedAt: Date.now(),
        lat: validateCoordinate(t.lat, -90, 90),
        lng: validateCoordinate(t.lng, -180, 180),
        speed: t.speed || 0,
        heading: normalizeHeading(t.heading),
        ignition: t.ignition,
        fuelLevel: t.fuelLevel ? Math.max(0, Math.min(100, t.fuelLevel)) : undefined,
        odometer: t.odometer || 0,
        satellites: t.satellites,
        signalStrength: t.signalStrength,
        processed: false,
        createdAt: new Date().toISOString()
      };

      validEvents.push(event);
    }

    // Send batch to queue
    if (validEvents.length > 0) {
      await c.env.TELEMETRY_QUEUE.sendBatch(validEvents.map(e => ({ body: e })));
    }

    return c.json({
      success: true,
      accepted: validEvents.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Bulk ingestion error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Deduplication check endpoint
app.post('/api/dedup/check', async (c) => {
  try {
    const { eventId, imei, timestamp } = await c.req.json();
    
    // Simple deduplication based on event ID
    // In production, would check against Redis or KV store
    const isDuplicate = false;

    return c.json({ duplicate: isDuplicate });
  } catch (err) {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

// Validation helper functions
function validateCoordinate(value: number, min: number, max: number): number {
  if (typeof value !== 'number' || isNaN(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizeHeading(heading?: number): number {
  if (typeof heading !== 'number' || isNaN(heading)) {
    return 0;
  }
  return ((heading % 360) + 360) % 360;
}

export default app;
