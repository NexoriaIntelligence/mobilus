# Mobilus Enterprise Telemetry Architecture

## Executive Summary

Mobilus is an enterprise-grade distributed GPS telemetry platform designed for massive fleet scale:

- **100k vehicles** tracked simultaneously
- **500k websocket clients** for realtime updates
- **10k telemetry events/sec** ingestion capacity
- **Zero packet loss** guarantee with retry architecture

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           MOBULUS ENTERPRISE ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐     ┌──────────────────┐     ┌─────────────────────────────┐  │
│  │              │ TCP │                  │     │                             │  │
│  │  GPS Trackers ├────►│   TCP Gateway    │────►│   Ingestion Worker          │  │
│  │  (50k conn)  │     │   (Node.js)      │     │   (Cloudflare Workers)      │  │
│  │              │     │                  │     │                             │  │
│  └──────────────┘     └──────────────────┘     └─────────────┬───────────────┘  │
│                                                               │                   │
│                                                               ▼                   │
│  ┌──────────────┐     ┌──────────────────┐     ┌─────────────────────────────┐  │
│  │              │     │                  │     │                             │  │
│  │  Web/Mobile  │◄────│   Realtime       │◄────│   Queue Processor Worker    │  │
│  │  Clients     │ WS  │   Durable Objects│     │   (Cloudflare Workers)      │  │
│  │  (500k conn) │     │   (Cloudflare)   │     │                             │  │
│  │              │     │                  │     │                             │  │
│  └──────────────┘     └──────────────────┘     └─────────────┬───────────────┘  │
│                                                               │                   │
│                    ┌──────────────────────────────────────────┼───────────────┐  │
│                    │                                          │               │  │
│                    ▼                                          ▼               │  │
│           ┌──────────────────┐                    ┌───────────────────────┐   │  │
│           │                  │                    │                       │   │  │
│           │   Supabase       │                    │   ThingBoard IoT      │   │  │
│           │   (PostgreSQL)   │                    │   (Device Mgmt)       │   │  │
│           │                  │                    │                       │   │  │
│           └──────────────────┘                    └───────────────────────┘   │  │
│                    │                                                           │  │
│                    ▼                                                           │  │
│           ┌──────────────────┐                                                 │  │
│           │                  │                                                 │  │
│           │   Cloudflare R2  │◄──────── Archive Pipeline                      │  │
│           │   (Parquet)      │                                                 │  │
│           │                  │                                                 │  │
│           └──────────────────┘                                                 │  │
│                                                                                │  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```
mobilus/
├── apps/
│   ├── tcp-gateway/              # Node.js TCP server for GPS trackers
│   │   ├── src/
│   │   │   ├── servers/          # TCP socket listeners
│   │   │   ├── protocols/        # Protocol decoders (Teltonika, GT06, TK103)
│   │   │   ├── sessions/         # Device session management
│   │   │   ├── middleware/       # Auth, rate limiting, flood protection
│   │   │   ├── metrics/          # Prometheus exporters
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   ├── docker-compose.yml
│   │   └── package.json
│   │
│   ├── telemetry-ingestion-worker/    # Lightweight Cloudflare Worker
│   │   ├── src/
│   │   │   ├── handlers/         # HTTP ingest endpoints
│   │   │   ├── validators/       # Packet validation
│   │   │   ├── normalizers/      # Telemetry normalization
│   │   │   └── index.ts
│   │   ├── wrangler.toml
│   │   └── package.json
│   │
│   ├── telemetry-processor-worker/    # Heavy processing worker
│   │   ├── src/
│   │   │   ├── processors/       # Alert, geofence, analytics
│   │   │   ├── writers/          # Supabase, ThingBoard sync
│   │   │   ├── broadcasters/     # WebSocket event publishing
│   │   │   └── index.ts
│   │   ├── wrangler.toml
│   │   └── package.json
│   │
│   ├── realtime-service/         # Durable Objects WebSocket hub
│   │   ├── src/
│   │   │   ├── objects/          # Durable Object classes
│   │   │   ├── rooms/            # Vehicle/agency room management
│   │   │   ├── presence/         # User presence tracking
│   │   │   ├── compression/      # Delta compression
│   │   │   └── index.ts
│   │   ├── wrangler.toml
│   │   └── package.json
│   │
│   ├── archive-worker/           # Telemetry archival pipeline
│   │   ├── src/
│   │   │   ├── exporters/        # Parquet export
│   │   │   ├── uploaders/        # R2 upload
│   │   │   ├── cleanup/          # Hot data cleanup
│   │   │   └── index.ts
│   │   ├── wrangler.toml
│   │   └── package.json
│   │
│   └── map-dashboard/            # React frontend
│       ├── src/
│       │   ├── components/       # UI components
│       │   ├── maps/             # MapLibre rendering
│       │   ├── stores/           # Zustand state
│       │   ├── hooks/            # WebSocket hooks
│       │   └── App.tsx
│       ├── vite.config.ts
│       └── package.json
│
├── packages/
│   ├── protocol-decoders/        # GPS protocol parsing libraries
│   │   ├── src/
│   │   │   ├── teltonika/        # Codec8 decoder
│   │   │   ├── gt06/             # GT06 decoder
│   │   │   ├── tk103/            # TK103 decoder
│   │   │   ├── concox/           # Concox decoder
│   │   │   ├── huabao/           # Huabao decoder
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── telemetry-types/          # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── telemetry.ts
│   │   │   ├── events.ts
│   │   │   ├── devices.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── websocket-sdk/            # Client WebSocket library
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── reconnect.ts
│   │   │   ├── events.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── telemetry-core/           # Core business logic
│   │   ├── src/
│   │   │   ├── deduplication.ts
│   │   │   ├── idempotency.ts
│   │   │   ├── validation.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── telemetry-security/       # Security middleware
│       ├── src/
│       │   ├── hmac.ts
│       │   ├── replay-protection.ts
│       │   ├── rate-limiting.ts
│       │   └── index.ts
│       └── package.json
│
├── infra/
│   ├── kubernetes/               # K8s manifests
│   ├── cloudflare/               # Wrangler configs
│   ├── monitoring/               # Grafana/Prometheus
│   └── terraform/                # IaC definitions
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── deployment/
│   └── security/
│
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── turbo.json
└── package.json
```

---

## Service Responsibilities

### 1. TCP Gateway Service (`apps/tcp-gateway`)

**Purpose:** Accept raw TCP connections from GPS trackers

**Responsibilities:**
- Maintain 50k concurrent TCP socket connections
- Parse binary GPS protocol packets (Teltonika, GT06, TK103, Concox, Huabao)
- Validate CRC checksums and packet integrity
- Generate ACK responses to trackers
- Normalize telemetry to standard schema
- Forward normalized telemetry to ingestion worker
- Handle heartbeat tracking and idle timeouts
- Implement flood protection and IP throttling

**Key Metrics:**
- Active connections
- Packets per second
- Average packet latency
- Memory usage per connection
- Reconnection rate

---

### 2. Ingestion Worker (`apps/telemetry-ingestion-worker`)

**Purpose:** Lightweight telemetry validation and queue publishing

**Responsibilities:**
- Authenticate incoming telemetry requests
- Validate packet structure and required fields
- Normalize telemetry to canonical schema
- Generate idempotency keys
- Publish to Cloudflare Queue
- Return immediate ACK to caller
- Implement backpressure handling

**Processing Time Target:** < 10ms per event

---

### 3. Queue Processor Worker (`apps/telemetry-processor-worker`)

**Purpose:** Heavy async processing of telemetry events

**Responsibilities:**
- Consume from Cloudflare Queue
- Write to Supabase PostgreSQL
- Synchronize with ThingBoard IoT
- Broadcast to Realtime Durable Objects
- Process alert rules (overspeeding, harsh braking)
- Check geofence enter/exit
- Update analytics aggregates
- Handle retry logic with exponential backoff
- Route poison messages to Dead Letter Queue

**Batch Size:** 100 events per batch
**Target Throughput:** 10k events/sec

---

### 4. Realtime Durable Objects Service (`apps/realtime-service`)

**Purpose:** WebSocket hub for live vehicle tracking

**Responsibilities:**
- Maintain 500k concurrent WebSocket connections
- Manage vehicle rooms (subscribe by vehicle ID)
- Manage agency rooms (subscribe by organization)
- Track user presence
- Implement delta compression for position updates
- Handle auto-reconnection with state recovery
- Implement heartbeat system
- Batch events for high-frequency updates
- Handle backpressure for slow clients

**Event Types:**
- `vehicle_position` - Live GPS coordinates
- `alert_created` - Safety alerts
- `geofence_enter` / `geofence_exit`
- `harsh_braking` / `overspeeding`
- `trip_started` / `trip_ended`
- `driver_online` / `driver_offline`

---

### 5. Analytics Pipeline (`apps/telemetry-processor-worker`)

**Purpose:** Realtime and batch analytics

**Responsibilities:**
- Driver behavior scoring
- Trip analytics
- Fleet utilization metrics
- Fuel consumption analysis
- Maintenance predictions
- Geofence dwell time calculation

---

### 6. Archive Pipeline (`apps/archive-worker`)

**Purpose:** Cost-effective telemetry storage

**Responsibilities:**
- Hourly batch export of hot telemetry
- Convert to Parquet format with compression
- Upload to Cloudflare R2
- Delete archived rows from PostgreSQL
- Support historical replay via API
- Maintain retention policies (hot: 30 days, cold: unlimited)

---

## Communication Flow

### Telemetry Ingestion Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   GPS       │     │   TCP       │     │   Ingestion │     │   Queue     │
│   Tracker   │────►│   Gateway   │────►│   Worker    │────►│   Processor │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       │  1. TCP Connect   │                   │                   │
       │──────────────────►│                   │                   │
       │                   │                   │                   │
       │  2. IMEI Handshake│                   │                   │
       │──────────────────►│                   │                   │
       │                   │                   │                   │
       │  3. GPS Data      │                   │                   │
       │──────────────────►│                   │                   │
       │                   │                   │                   │
       │                   │  4. HTTP POST     │                   │
       │                   │──────────────────►│                   │
       │                   │                   │                   │
       │  5. ACK           │                   │                   │
       │◄──────────────────│                   │                   │
       │                   │                   │                   │
       │                   │  6. Queue Publish │                   │
       │                   │──────────────────────────────────────►│
       │                   │                   │                   │
       │                   │  7. ACK           │                   │
       │                   │◄──────────────────│                   │
       │                   │                   │                   │
```

### Queue Processing Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Queue     │     │   Processor │     │   Supabase  │     │   Realtime  │
│   Processor │────►│   Worker    │────►│   (Postgres)│     │   Service   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       │  1. Batch Fetch   │                   │                   │
       │──────────────────►│                   │                   │
       │                   │                   │                   │
       │                   │  2. Deduplicate   │                   │
       │                   │─────────┐         │                   │
       │                   │         │         │                   │
       │                   │◄────────┘         │                   │
       │                   │                   │                   │
       │                   │  3. Write Telemetry                   │
       │                   │──────────────────►│                   │
       │                   │                   │                   │
       │                   │  4. ThingBoard Sync                   │
       │                   │──────────────────────────────────────►│
       │                   │                   │                   │
       │                   │  5. Alert Processing                  │
       │                   │─────────┐         │                   │
       │                   │         │         │                   │
       │                   │◄────────┘         │                   │
       │                   │                   │                   │
       │                   │  6. Broadcast Event                   │
       │                   │──────────────────────────────────────►│
       │                   │                   │                   │
```

### Realtime Event Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │     │   Cloudflare│     │   Durable   │     │   Other     │
│   Client    │────►│   Edge      │────►│   Object    │     │   Clients   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       │  1. WebSocket Conn│                   │                   │
       │──────────────────►│                   │                   │
       │                   │                   │                   │
       │                   │  2. Route to DO   │                   │
       │                   │──────────────────►│                   │
       │                   │                   │                   │
       │                   │  3. Auth & Join Room                  │
       │                   │──────────────────►│                   │
       │                   │                   │                   │
       │  4. Connection ACK│                   │                   │
       │◄──────────────────│                   │                   │
       │                   │                   │                   │
       │                   │  5. Position Update                   │
       │                   │──────────────────►│                   │
       │                   │                   │                   │
       │                   │  6. Broadcast to Subscribers          │
       │                   │◄──────────────────│                   │
       │                   │                   │                   │
       │  7. Delta Position│                   │                   │
       │◄──────────────────│                   │                   │
       │                   │                   │                   │
```

---

## Queue Topology

### Primary Queue: `telemetry-events`

```yaml
queue_name: telemetry-events
delivery_delay: 0
batch_size: 100
max_batch_timeout: 1000ms
max_retries: 5
dead_letter_queue: telemetry-dlq
```

### Retry Queue: `telemetry-retry`

```yaml
queue_name: telemetry-retry
delivery_delay: 5000ms  # 5 second initial delay
backoff_multiplier: 2   # Exponential backoff
max_retries: 3
dead_letter_queue: telemetry-dlq
```

### Dead Letter Queue: `telemetry-dlq`

```yaml
queue_name: telemetry-dlq
delivery_delay: 0
retention_days: 30
alert_on_threshold: 100  # Alert if DLQ exceeds 100 messages
```

### Queue Routing Rules

| Event Type | Primary Queue | Retry Strategy | Priority |
|------------|---------------|----------------|----------|
| `position` | telemetry-events | exponential | normal |
| `alert` | telemetry-events | immediate | high |
| `geofence_event` | telemetry-events | exponential | high |
| `trip_event` | telemetry-events | exponential | normal |
| `diagnostic` | telemetry-events | none | low |

---

## WebSocket Topology

### Connection Hierarchy

```
Client → Cloudflare Edge → Durable Object Stub → Durable Object Instance
```

### Room Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    Durable Object Instance                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  Vehicle Room   │  │  Vehicle Room   │  │ Agency Room │ │
│  │  VEH-001        │  │  VEH-002        │  │ AGY-ACME    │ │
│  │                 │  │                 │  │             │ │
│  │  • Client A     │  │  • Client C     │  │  • Client A │ │
│  │  • Client B     │  │  • Client D     │  │  • Client C │ │
│  │                 │  │                 │  │  • Client E │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│                                                              │
│  Presence Registry:                                          │
│  • Client A: online, last_seen: 2024-01-15T10:30:00Z        │
│  • Client B: online, last_seen: 2024-01-15T10:29:55Z        │
│  • Client C: online, last_seen: 2024-01-15T10:30:02Z        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### WebSocket Message Schema

```typescript
// Client → Server
interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'heartbeat' | 'auth';
  payload: {
    vehicleIds?: string[];
    agencyId?: string;
    token?: string;
    lastEventId?: string;  // For reconnection
  };
}

// Server → Client
interface ServerMessage {
  type: 'position' | 'alert' | 'geofence' | 'presence' | 'heartbeat_ack';
  eventId: string;
  timestamp: number;
  payload: VehiclePosition | Alert | GeofenceEvent | PresenceUpdate;
}
```

---

## Realtime Event Flow

### Event Lifecycle

```
1. Telemetry Received
        ↓
2. Queue Processor validates & processes
        ↓
3. Alert rules evaluated
        ↓
4. Geofence checks performed
        ↓
5. Event published to Realtime Service
        ↓
6. Durable Object routes to appropriate rooms
        ↓
7. Delta compression applied
        ↓
8. Events batched (100ms window)
        ↓
9. WebSocket broadcast to subscribers
        ↓
10. Client receives and renders update
```

### Event Deduplication

```typescript
interface IdempotencyKey {
  imei: string;
  timestamp: number;
  sequenceNumber?: number;
}

// Generate hash: SHA256(imei:timestamp:sequenceNumber)
// Store in Redis with 5-minute TTL
// Reject duplicate within TTL window
```

---

## Telemetry Lifecycle

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         TELEMETRY LIFECYCLE                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌────────┐ │
│  │         │    │         │    │         │    │         │    │        │ │
│  │ Capture │───►│ Ingest  │───►│ Process │───►│ Store   │───►│ Archive│ │
│  │         │    │         │    │         │    │ (Hot)   │    │ (Cold) │ │
│  │         │    │         │    │         │    │         │    │        │ │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘    └────────┘ │
│      │              │              │              │              │       │
│      │              │              │              │              │       │
│  GPS Device     TCP Gateway    Queue Worker   Supabase      R2 Storage  │
│  1Hz-10Hz       <10ms          <50ms          <20ms         Async       │
│                                                                           │
│  Retention: Real-time → 30 days (hot) → Unlimited (cold/Parquet)        │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### State Transitions

| Stage | Storage | Latency | Access Pattern | Cost |
|-------|---------|---------|----------------|------|
| Capture | In-memory | <1ms | Write | $0 |
| Ingest | Queue | <10ms | Write | $ |
| Process | RAM | <50ms | Read/Write | $$ |
| Store (Hot) | PostgreSQL | <20ms | Read/Write | $$$ |
| Archive (Cold) | R2 Parquet | <500ms | Read-only | $ |

---

## Retry Architecture

### Exponential Backoff Strategy

```typescript
const retryConfig = {
  maxRetries: 5,
  initialDelay: 1000,      // 1 second
  maxDelay: 60000,         // 60 seconds
  backoffMultiplier: 2,    // Double each retry
  jitter: 0.1,             // 10% random jitter
};

function calculateDelay(attempt: number): number {
  const baseDelay = retryConfig.initialDelay * Math.pow(retryConfig.backoffMultiplier, attempt);
  const cappedDelay = Math.min(baseDelay, retryConfig.maxDelay);
  const jitterAmount = cappedDelay * retryConfig.jitter * Math.random();
  return cappedDelay + jitterAmount;
}
```

### Retry Decision Matrix

| Error Type | Retry? | Strategy | Max Attempts |
|------------|--------|----------|--------------|
| Network timeout | Yes | Exponential backoff | 5 |
| Database deadlock | Yes | Immediate retry | 3 |
| Validation error | No | Send to DLQ | 0 |
| Rate limit | Yes | Fixed delay (5s) | 5 |
| Authentication failure | No | Alert + DLQ | 0 |
| Malformed packet | No | Drop + log | 0 |

---

## Dead Letter Queue Architecture

### DLQ Processing Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   DLQ       │     │   DLQ       │     │   Manual    │
│   Messages  │────►│   Analyzer  │────►│   Review    │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Auto-     │
                    │   Retry     │
                    │   (if fixable) │
                    └─────────────┘
```

### DLQ Alert Thresholds

```yaml
alerts:
  dlq_size_warning: 100      # Warn when DLQ > 100 messages
  dlq_size_critical: 1000    # Critical when DLQ > 1000 messages
  dlq_growth_rate: 10/min    # Alert on rapid growth
  poison_message_pattern:    # Auto-alert on known patterns
    - "invalid_imei"
    - "malformed_crc"
    - "authentication_failed"
```

---

## Replay Protection

### Implementation Strategy

```typescript
interface ReplayProtection {
  // Track seen message IDs with TTL
  seenMessages: Map<string, number>;  // messageId → firstSeenTimestamp
  
  // Check if message is a replay
  isReplay(messageId: string, timestamp: number): boolean {
    const firstSeen = this.seenMessages.get(messageId);
    
    // If never seen, not a replay
    if (!firstSeen) {
      this.seenMessages.set(messageId, Date.now());
      return false;
    }
    
    // If seen within TTL window, it's a replay
    const ttl = 5 * 60 * 1000;  // 5 minutes
    return Date.now() - firstSeen < ttl;
  }
  
  // Cleanup old entries
  cleanup() {
    const now = Date.now();
    const ttl = 5 * 60 * 1000;
    for (const [id, timestamp] of this.seenMessages.entries()) {
      if (now - timestamp > ttl) {
        this.seenMessages.delete(id);
      }
    }
  }
}
```

### Sequence Number Validation (Per Device)

```typescript
interface DeviceSequenceTracker {
  imei: string;
  lastSequenceNumber: number;
  lastTimestamp: number;
  
  isValid(sequenceNumber: number, timestamp: number): boolean {
    // Allow out-of-order within 5-second window
    const timeWindow = 5000;
    
    if (timestamp > this.lastTimestamp + timeWindow) {
      // New time window, accept any sequence
      this.lastSequenceNumber = sequenceNumber;
      this.lastTimestamp = timestamp;
      return true;
    }
    
    // Within window, sequence must be greater
    if (sequenceNumber > this.lastSequenceNumber) {
      this.lastSequenceNumber = sequenceNumber;
      this.lastTimestamp = timestamp;
      return true;
    }
    
    return false;  // Replay or out-of-order
  }
}
```

---

## Telemetry Deduplication

### Multi-Layer Deduplication

```
Layer 1: TCP Gateway
  • IMEI + Timestamp + Sequence Number hash
  • In-memory cache (LRU, 10k entries)
  • TTL: 60 seconds

Layer 2: Ingestion Worker
  • Idempotency key generation
  • Redis-based dedup (shared across workers)
  • TTL: 5 minutes

Layer 3: Queue Processor
  • Database unique constraint check
  • Graceful handling of duplicates
  • Audit log for duplicate detection
```

### Deduplication Key Generation

```typescript
function generateDedupKey(telemetry: NormalizedTelemetry): string {
  const components = [
    telemetry.imei,
    telemetry.timestamp.toISOString(),
    telemetry.lat.toFixed(6),
    telemetry.lng.toFixed(6),
    telemetry.sequenceNumber?.toString() || '',
  ];
  
  return createHash('sha256')
    .update(components.join(':'))
    .digest('hex');
}
```

---

## Idempotency Implementation

### Idempotency Key Strategy

```typescript
interface IdempotencyConfig {
  keyGenerator: (request: IngestRequest) => string;
  ttl: number;           // 24 hours
  storage: 'redis' | 'durable-object';
}

// Request includes Idempotency-Key header
// If key exists with same payload → return cached response
// If key exists with different payload → return 409 Conflict
// If key doesn't exist → process and store response
```

### Idempotency Middleware

```typescript
async function idempotencyMiddleware(request: Request, next: () => Response) {
  const idempotencyKey = request.headers.get('Idempotency-Key');
  
  if (!idempotencyKey) {
    return next();  // No idempotency requested
  }
  
  const existing = await redis.get(`idem:${idempotencyKey}`);
  
  if (existing) {
    const stored = JSON.parse(existing);
    
    // Verify request body matches
    const bodyHash = await hashBody(request.body);
    if (stored.bodyHash === bodyHash) {
      return new Response(stored.response, {
        status: stored.status,
        headers: stored.headers,
      });
    } else {
      return new Response('Idempotency key conflict', { status: 409 });
    }
  }
  
  // Process request
  const response = await next();
  
  // Store for future idempotent requests
  await redis.setex(
    `idem:${idempotencyKey}`,
    86400,  // 24 hours
    JSON.stringify({
      bodyHash: await hashBody(request.body),
      response: await response.clone().text(),
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
    })
  );
  
  return response;
}
```

---

## Scaling Strategy

### Horizontal Scaling Targets

| Component | Initial | Scale Target | Scaling Trigger |
|-----------|---------|--------------|-----------------|
| TCP Gateway | 2 instances | 20 instances | Connections > 25k per instance |
| Ingestion Worker | 1 worker | 10 workers | Queue depth > 1000 |
| Processor Worker | 1 worker | 20 workers | Queue depth > 5000 |
| Durable Objects | Auto | 100+ instances | WebSocket connections > 5k per DO |

### Cloudflare Workers Scaling

```yaml
# wrangler.toml
[vars]
MAX_CONCURRENT_HANDLERS = 1000
BATCH_SIZE = 100
QUEUE_BATCH_TIMEOUT_MS = 1000

[observability]
enabled = true
head_sampling_rate = 0.1  # 10% trace sampling
```

### Auto-Scaling Configuration

```yaml
# Kubernetes HPA for TCP Gateway
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: tcp-gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: tcp-gateway
  minReplicas: 2
  maxReplicas: 50
  metrics:
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 70
    - type: Pods
      pods:
        metric:
          name: active_connections
        target:
          type: AverageValue
          averageValue: "25000"
```

---

## Deployment Topology

### Regional Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GLOBAL DEPLOYMENT                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │                  │    │                  │    │                  │  │
│  │   North America  │    │     Europe       │    │   Asia Pacific   │  │
│  │   (us-east-1)    │    │   (eu-west-1)    │    │   (ap-southeast-1)│ │
│  │                  │    │                  │    │                  │  │
│  │  • TCP Gateway   │    │  • TCP Gateway   │    │  • TCP Gateway   │  │
│  │  • Workers       │    │  • Workers       │    │  • Workers       │  │
│  │  • DO (active)   │    │  • DO (active)   │    │  • DO (active)   │  │
│  │                  │    │                  │    │                  │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘  │
│           │                     │                     │                 │
│           └─────────────────────┼─────────────────────┘                 │
│                                 │                                       │
│                                 ▼                                       │
│                    ┌─────────────────────┐                              │
│                    │                     │                              │
│                    │   Supabase Global   │                              │
│                    │   (Primary: us-east)│                              │
│                    │   (Replica: eu-west)│                              │
│                    │                     │                              │
│                    └─────────────────────┘                              │
│                                 │                                       │
│                                 ▼                                       │
│                    ┌─────────────────────┐                              │
│                    │                     │                              │
│                    │   Cloudflare R2     │                              │
│                    │   (Multi-region)    │                              │
│                    │                     │                              │
│                    └─────────────────────┘                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Failover Strategy

| Failure Scenario | Detection | Failover Action | RTO | RPO |
|------------------|-----------|-----------------|-----|-----|
| TCP Gateway instance down | Health check fail | Traffic rerouted to healthy instance | <30s | 0 |
| Worker crash | Error rate spike | Automatic restart + queue retry | <10s | 0 |
| Durable Object failure | Connection errors | DO migrates to new host | <5s | 0 |
| Supabase primary down | Replication lag alert | Promote replica to primary | <60s | <5s |
| Region outage | Multiple service failures | DNS failover to backup region | <5min | <1min |

---

## Cloudflare Bindings

### Environment Configuration

```toml
# wrangler.toml (telemetry-ingestion-worker)
name = "telemetry-ingestion-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"
BATCH_SIZE = "100"
QUEUE_BATCH_TIMEOUT_MS = "1000"

[[queues.producers]]
queue = "telemetry-events"
binding = "TELEMETRY_QUEUE"

[[queues.producers]]
queue = "telemetry-retry"
binding = "RETRY_QUEUE"

[[services]]
binding = "REALTIME_SERVICE"
service = "realtime-service"

[observability]
enabled = true
head_sampling_rate = 0.1
```

```toml
# wrangler.toml (telemetry-processor-worker)
name = "telemetry-processor-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"
SUPABASE_URL = "https://xxx.supabase.co"
THINGBOARD_API_URL = "https://thingsboard.io"
WEBSOCKET_BROADCAST_URL = "wss://realtime.mobilus.com"

[[queues.consumers]]
queue = "telemetry-events"
max_batch_size = 100
max_batch_timeout = 1000
max_retries = 5
dead_letter_queue = "telemetry-dlq"

[[queues.consumers]]
queue = "telemetry-retry"
max_batch_size = 50
max_batch_timeout = 2000

[[services]]
binding = "REALTIME_SERVICE"
service = "realtime-service"

[durable_objects]
bindings = [
  { name = "REALTIME_HUB", class_name = "RealtimeHub" }
]

[observability]
enabled = true
head_sampling_rate = 0.1
```

```toml
# wrangler.toml (realtime-service)
name = "realtime-service"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ENVIRONMENT = "production"
MAX_CONNECTIONS_PER_DO = "5000"
HEARTBEAT_INTERVAL_MS = "30000"
DELTA_COMPRESSION_ENABLED = "true"

[durable_objects]
bindings = [
  { name = "REALTIME_HUB", class_name = "RealtimeHub" }
]

[[durable_objects.migrations]]
tag = "v1"
new_classes = ["RealtimeHub"]

[migrations]
keep_compatibility = true

[observability]
enabled = true
head_sampling_rate = 0.1
```

---

## Environment Variables

### TCP Gateway

```bash
# Server Configuration
TCP_PORT=5050
TCP_PORT_TELTONIKA=5051
TCP_PORT_GT06=5052
TCP_PORT_TK103=5053
TCP_PORT_CONCOX=5054
TCP_PORT_HUABAO=5055

SOCKET_KEEPALIVE=true
KEEPALIVE_INITIAL_DELAY=60000
KEEPALIVE_INTERVAL=30000
IDLE_TIMEOUT=300000  # 5 minutes

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_POOL_SIZE=20
REDIS_COMMAND_TIMEOUT=5000

# Ingestion API
INGESTION_API_URL=https://telemetry-api.mobilus.com/api/ingest
INGESTION_API_KEY=<secret>
INGESTION_BATCH_SIZE=100
INGESTION_FLUSH_INTERVAL=1000

# Security
RATE_LIMIT_REQUESTS_PER_MINUTE=1000
FLOOD_THRESHOLD_PER_SECOND=100
ALLOWED_IP_RANGES=10.0.0.0/8,172.16.0.0/12

# Monitoring
PROMETHEUS_PORT=9090
METRICS_PATH=/metrics
LOG_LEVEL=info

# PM2 Configuration
PM2_INSTANCES=max
PM2_RESTART_DELAY=5000
```

### Ingestion Worker

```bash
# Cloudflare
WORKER_ENV=production
CF_ACCOUNT_ID=<account_id>

# Queue
QUEUE_NAME=telemetry-events
BATCH_SIZE=100
QUEUE_TIMEOUT_MS=1000

# Security
API_KEY_HEADER=X-API-Key
VALID_API_KEYS=<comma_separated_keys>
JWT_SECRET=<secret>
JWT_ISSUER=mobilus-telemetry

# Redis (for deduplication)
REDIS_URL=<redis_url>
DEDUP_TTL_SECONDS=300

# Observability
LOG_LEVEL=info
TRACE_SAMPLE_RATE=0.1
```

### Processor Worker

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_key>

# ThingBoard
THINGBOARD_BASE_URL=https://thingsboard.io
THINGBOARD_API_TOKEN=<token>

# Realtime
REALTIME_SERVICE_URL=wss://realtime.mobilus.com
REALTIME_SERVICE_AUTH_TOKEN=<token>

# Queue
QUEUE_NAME=telemetry-events
RETRY_QUEUE_NAME=telemetry-retry
DLQ_NAME=telemetry-dlq
MAX_RETRIES=5

# Processing
ALERT_RULES_ENABLED=true
GEOFENCE_CHECK_ENABLED=true
ANALYTICS_UPDATE_ENABLED=true

# Observability
LOG_LEVEL=info
TRACE_SAMPLE_RATE=0.1
```

### Realtime Service

```bash
# Cloudflare
WORKER_ENV=production
CF_ACCOUNT_ID=<account_id>

# WebSocket
MAX_CONNECTIONS_PER_DO=5000
HEARTBEAT_INTERVAL_MS=30000
RECONNECT_WINDOW_MS=300000  # 5 minutes
DELTA_COMPRESSION=true
BATCH_INTERVAL_MS=100

# Security
WS_AUTH_SECRET=<secret>
TOKEN_EXPIRY_SECONDS=3600

# Observability
LOG_LEVEL=info
TRACE_SAMPLE_RATE=0.1
```

---

## Internal APIs

### Ingestion API

```typescript
// POST /api/ingest
// Content-Type: application/json

interface IngestRequest {
  imei: string;
  protocol: 'teltonika' | 'gt06' | 'tk103' | 'concox' | 'huabao';
  timestamp: string;  // ISO 8601
  position: {
    lat: number;
    lng: number;
    accuracy?: number;
  };
  telemetry: {
    speed: number;      // km/h
    heading: number;    // degrees 0-359
    altitude?: number;
    satellites?: number;
    signalStrength?: number;
    ignition?: boolean;
    fuelLevel?: number;
    odometer?: number;
    inputs?: Record<string, boolean>;
    outputs?: Record<string, boolean>;
    analogInputs?: Record<string, number>;
  };
  raw?: string;  // Base64 encoded original packet
}

// Response
interface IngestResponse {
  success: true;
  eventId: string;
  queued: boolean;
}
```

### Realtime WebSocket API

```typescript
// Connection URL: wss://realtime.mobilus.com/ws

// Client → Server Messages
type ClientMessage = 
  | { type: 'auth'; payload: { token: string } }
  | { type: 'subscribe'; payload: { vehicleIds: string[]; agencyId?: string } }
  | { type: 'unsubscribe'; payload: { vehicleIds: string[] } }
  | { type: 'heartbeat'; payload: { lastEventId?: string } };

// Server → Client Messages
type ServerMessage =
  | { type: 'auth_success'; payload: { sessionId: string } }
  | { type: 'auth_error'; payload: { error: string } }
  | { type: 'position'; eventId: string; timestamp: number; payload: VehiclePosition }
  | { type: 'alert'; eventId: string; timestamp: number; payload: Alert }
  | { type: 'geofence'; eventId: string; timestamp: number; payload: GeofenceEvent }
  | { type: 'presence'; payload: PresenceUpdate }
  | { type: 'heartbeat_ack'; payload: { lastEventId: string } };
```

### Admin API (TCP Gateway)

```typescript
// GET /api/health
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  activeConnections: number;
  packetsPerSecond: number;
  memoryUsage: number;
}

// GET /api/metrics
// Prometheus format metrics

// GET /api/sessions
interface SessionListResponse {
  sessions: Array<{
    imei: string;
    connectedAt: string;
    lastPacketAt: string;
    packetCount: number;
    remoteAddress: string;
    protocol: string;
  }>;
  total: number;
}

// DELETE /api/sessions/:imei
interface DisconnectResponse {
  success: boolean;
  message?: string;
}
```

---

## Event Schemas

### Telemetry Event

```typescript
interface TelemetryEvent {
  eventId: string;
  eventType: 'telemetry';
  source: 'tcp-gateway';
  timestamp: string;  // ISO 8601
  
  payload: {
    imei: string;
    deviceId?: string;
    protocol: string;
    
    position: {
      lat: number;
      lng: number;
      accuracy?: number;
      altitude?: number;
    };
    
    movement: {
      speed: number;      // km/h
      heading: number;    // degrees
      course?: number;
    };
    
    vehicle: {
      ignition?: boolean;
      odometer?: number;
      fuelLevel?: number;
      engineHours?: number;
    };
    
    diagnostics: {
      satellites?: number;
      signalStrength?: number;  // dBm
      batteryVoltage?: number;
      externalPowerVoltage?: number;
      temperature?: number;
    };
    
    io: {
      digitalInputs?: Record<string, boolean>;
      digitalOutputs?: Record<string, boolean>;
      analogInputs?: Record<string, number>;
    };
    
    raw?: {
      hex: string;
      base64: string;
    };
  };
  
  metadata: {
    receivedAt: string;
    processedAt?: string;
    sequenceNumber?: number;
    idempotencyKey: string;
  };
}
```

### Alert Event

```typescript
interface AlertEvent {
  eventId: string;
  eventType: 'alert';
  source: 'processor-worker';
  timestamp: string;
  
  payload: {
    alertType: 
      | 'overspeeding'
      | 'harsh_braking'
      | 'rapid_acceleration'
      | 'unsafe_cornering'
      | 'geofence_enter'
      | 'geofence_exit'
      | 'idle_timeout'
      | 'maintenance_due'
      | 'panic_button'
      | 'towing_detected'
      | 'low_battery';
    
    severity: 'info' | 'warning' | 'critical';
    
    vehicle: {
      imei: string;
      deviceId: string;
      licensePlate?: string;
      driverId?: string;
    };
    
    location: {
      lat: number;
      lng: number;
      address?: string;
    };
    
    context: {
      speed?: number;
      speedLimit?: number;
      geofenceId?: string;
      geofenceName?: string;
      duration?: number;
      threshold?: number;
      actualValue?: number;
    };
    
    acknowledged?: boolean;
    acknowledgedBy?: string;
    acknowledgedAt?: string;
  };
}
```

### Geofence Event

```typescript
interface GeofenceEvent {
  eventId: string;
  eventType: 'geofence';
  source: 'processor-worker';
  timestamp: string;
  
  payload: {
    eventType: 'enter' | 'exit' | 'dwell_start' | 'dwell_end';
    
    geofence: {
      id: string;
      name: string;
      type: 'polygon' | 'circle';
    };
    
    vehicle: {
      imei: string;
      deviceId: string;
      licensePlate?: string;
    };
    
    location: {
      lat: number;
      lng: number;
    };
    
    dwellTime?: number;  // milliseconds (for dwell_end events)
  };
}
```

### Presence Event

```typescript
interface PresenceEvent {
  eventId: string;
  eventType: 'presence';
  source: 'realtime-service';
  timestamp: string;
  
  payload: {
    userId: string;
    status: 'online' | 'offline' | 'away';
    lastSeen: string;
    activeVehicles: string[];
    activeAgencies: string[];
  };
}
```

---

## Observability

### Metrics Collection

```yaml
# Prometheus metrics exposed by each service

# TCP Gateway
mobilus_tcp_connections_active{protocol="teltonika"}
mobilus_tcp_packets_received_total{protocol="teltonika"}
mobilus_tcp_packets_invalid_total
mobilus_tcp_bytes_received_total
mobilus_tcp_session_duration_seconds
mobilus_tcp_ack_latency_seconds

# Ingestion Worker
mobilus_ingest_requests_total{status="success|error"}
mobilus_ingest_request_duration_seconds
mobilus_ingest_queue_publish_duration_seconds
mobilus_ingest_dedup_hits_total
mobilus_ingest_validation_errors_total

# Processor Worker
mobilus_process_queue_depth
mobilus_process_batch_size
mobilus_process_batch_duration_seconds
mobilus_process_supabase_write_duration_seconds
mobilus_process_alerts_generated_total{alert_type="overspeeding"}
mobilus_process_geofence_checks_total
mobilus_process_dlq_size
mobilus_process_retries_total

# Realtime Service
mobilus_ws_connections_active
mobilus_ws_messages_sent_total{type="position"}
mobilus_ws_messages_received_total
mobilus_ws_broadcast_latency_seconds
mobilus_ws_rooms_active
mobilus_ws_presence_updates_total
```

### Grafana Dashboards

#### Dashboard 1: System Overview

```json
{
  "dashboard": {
    "title": "Mobilus System Overview",
    "panels": [
      {
        "title": "Active TCP Connections",
        "targets": [{ "expr": "sum(mobilus_tcp_connections_active)" }]
      },
      {
        "title": "Telemetry Ingestion Rate",
        "targets": [{ "expr": "rate(mobilus_ingest_requests_total[5m])" }]
      },
      {
        "title": "Queue Depth",
        "targets": [{ "expr": "mobilus_process_queue_depth" }]
      },
      {
        "title": "Active WebSocket Connections",
        "targets": [{ "expr": "sum(mobilus_ws_connections_active)" }]
      },
      {
        "title": "Alert Rate",
        "targets": [{ "expr": "rate(mobilus_process_alerts_generated_total[5m])" }]
      }
    ]
  }
}
```

#### Dashboard 2: TCP Gateway Health

```json
{
  "dashboard": {
    "title": "TCP Gateway Health",
    "panels": [
      {
        "title": "Connections by Protocol",
        "targets": [{ "expr": "sum by (protocol) (mobilus_tcp_connections_active)" }]
      },
      {
        "title": "Packet Rate",
        "targets": [{ "expr": "rate(mobilus_tcp_packets_received_total[1m])" }]
      },
      {
        "title": "Invalid Packets",
        "targets": [{ "expr": "rate(mobilus_tcp_packets_invalid_total[1m])" }]
      },
      {
        "title": "ACK Latency (p95)",
        "targets": [{ "expr": "histogram_quantile(0.95, mobilus_tcp_ack_latency_seconds_bucket)" }]
      },
      {
        "title": "Memory Usage",
        "targets": [{ "expr": "process_resident_memory_bytes{job=\"tcp-gateway\"}" }]
      }
    ]
  }
}
```

#### Dashboard 3: Queue Processing

```json
{
  "dashboard": {
    "title": "Queue Processing",
    "panels": [
      {
        "title": "Queue Depth Over Time",
        "targets": [{ "expr": "mobilus_process_queue_depth" }]
      },
      {
        "title": "Batch Processing Rate",
        "targets": [{ "expr": "rate(mobilus_process_batch_size_sum[5m])" }]
      },
      {
        "title": "Processing Latency",
        "targets": [{ "expr": "histogram_quantile(0.95, mobilus_process_batch_duration_seconds_bucket)" }]
      },
      {
        "title": "DLQ Size",
        "targets": [{ "expr": "mobilus_process_dlq_size" }]
      },
      {
        "title": "Retry Rate",
        "targets": [{ "expr": "rate(mobilus_process_retries_total[5m])" }]
      }
    ]
  }
}
```

### Structured Logging

```typescript
// Log format (JSON)
interface StructuredLog {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  environment: string;
  traceId?: string;
  spanId?: string;
  message: string;
  context: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

// Example log entry
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "info",
  "service": "tcp-gateway",
  "environment": "production",
  "traceId": "abc123def456",
  "message": "TCP connection established",
  "context": {
    "remoteAddress": "203.0.113.50",
    "port": 5050,
    "protocol": "teltonika",
    "imei": "359074091234567"
  }
}
```

### Distributed Tracing

```typescript
// Trace propagation headers
interface TraceHeaders {
  'traceparent': string;  // W3C trace context
  'tracestate': string;   // Vendor-specific trace state
  'baggage': string;      // Key-value pairs across services
}

// Span attributes for telemetry ingestion
interface IngestSpanAttributes {
  'mobilus.imei': string;
  'mobilus.protocol': string;
  'mobilus.event_type': string;
  'mobilus.queue.name': string;
  'mobilus.dedup.hit': boolean;
}
```

---

## Production Hardening

### Resource Limits

```yaml
# Kubernetes resource limits for TCP Gateway
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "2000m"

# Health checks
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

### Circuit Breaker Configuration

```typescript
interface CircuitBreakerConfig {
  failureThreshold: 5;      // Open circuit after 5 failures
  resetTimeout: 30000;      // Try again after 30 seconds
  halfOpenRequests: 3;      // Allow 3 test requests in half-open state
  monitoringWindow: 10000;  // Count failures within 10 second window
}

// Services protected by circuit breakers:
// - Supabase writes
// - ThingBoard sync
// - Realtime broadcasts
// - Redis operations
```

### Graceful Shutdown

```typescript
// Graceful shutdown sequence
async function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  // 1. Stop accepting new connections
  server.close();
  
  // 2. Wait for in-flight requests to complete (max 30s)
  const shutdownTimeout = setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
  
  // 3. Flush pending queue messages
  await queue.flush();
  
  // 4. Close database connections
  await db.close();
  
  // 5. Close Redis connections
  await redis.quit();
  
  // 6. Clear shutdown timeout
  clearTimeout(shutdownTimeout);
  
  console.log('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

---

## Security Hardening

### Authentication & Authorization

```typescript
// JWT token structure for device authentication
interface DeviceTokenPayload {
  imei: string;
  deviceId: string;
  agencyId: string;
  permissions: ['telemetry:write'];
  exp: number;
  iat: number;
}

// JWT token structure for user authentication
interface UserTokenPayload {
  userId: string;
  agencyId: string;
  roles: string[];
  permissions: string[];
  exp: number;
  iat: number;
}

// HMAC signing for telemetry integrity
interface SignedTelemetry {
  payload: TelemetryData;
  signature: string;  // HMAC-SHA256(payload, deviceSecret)
  nonce: string;      // Unique per message
  timestamp: number;
}
```

### Rate Limiting

```typescript
interface RateLimitConfig {
  // Per-IP limits
  ip: {
    windowMs: 60000;
    maxRequests: 1000;
  };
  
  // Per-device limits
  device: {
    windowMs: 60000;
    maxRequests: 300;  // 5 Hz max
  };
  
  // Per-user API limits
  user: {
    windowMs: 60000;
    maxRequests: 100;
  };
}
```

### Input Validation

```typescript
// Strict validation for all incoming data
const telemetrySchema = z.object({
  imei: z.string().regex(/^\d{15}$/),
  timestamp: z.string().datetime(),
  position: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  telemetry: z.object({
    speed: z.number().min(0).max(500),
    heading: z.number().min(0).max(359),
    fuelLevel: z.number().min(0).max(100).optional(),
  }),
});
```

---

## Cost Optimization

### Storage Tiering Strategy

| Data Age | Storage | Cost/GB/month | Access Latency |
|----------|---------|---------------|----------------|
| 0-30 days | Supabase PostgreSQL | ~$0.50 | <20ms |
| 30-90 days | R2 Standard | ~$0.015 | <100ms |
| 90+ days | R2 Infrequent Access | ~$0.01 | <500ms |

### Query Optimization

```sql
-- Partition gps_tracking table by month
CREATE TABLE gps_tracking_2024_01 PARTITION OF gps_tracking
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Create indexes for common queries
CREATE INDEX idx_gps_tracking_device_time 
ON gps_tracking(device_id, timestamp DESC);

CREATE INDEX idx_gps_tracking_location 
ON gps_tracking USING gist(position);

-- Use materialized views for aggregations
CREATE MATERIALIZED VIEW daily_vehicle_summary AS
SELECT 
  device_id,
  DATE(timestamp) as date,
  COUNT(*) as point_count,
  MAX(speed) as max_speed,
  AVG(speed) as avg_speed
FROM gps_tracking
GROUP BY device_id, DATE(timestamp);

-- Refresh daily
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_vehicle_summary;
```

### Worker Optimization

```typescript
// Batch database writes
async function batchInsert(records: TelemetryRecord[]) {
  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await supabase.from('gps_tracking').insert(batch);
  }
}

// Use prepared statements
// Cache frequently accessed data
// Minimize Cold Starts with provisioned concurrency
```

---

## Recommended Scaling Strategy

### Phase 1: Foundation (0-10k vehicles)

- Single region deployment (us-east-1)
- 2 TCP Gateway instances
- 1 Ingestion Worker (Cloudflare)
- 1 Processor Worker (Cloudflare)
- 1 Durable Object instance per 5k connections
- Supabase Pro plan

### Phase 2: Growth (10k-50k vehicles)

- Add European region (eu-west-1)
- 5-10 TCP Gateway instances with auto-scaling
- Multiple Ingestion Workers with queue-based scaling
- Multiple Processor Workers based on queue depth
- Geographic Durable Object distribution
- Supabase Enterprise with read replicas

### Phase 3: Enterprise (50k-100k+ vehicles)

- Multi-region active-active
- 20+ TCP Gateway instances globally distributed
- Dedicated queue clusters per region
- Processor Worker auto-scaling based on multiple metrics
- Durable Objects with automatic sharding
- Custom Supabase cluster or migration to TimescaleDB
- ClickHouse for analytics workloads

---

## Next Steps

This architecture document provides the foundation for the Mobilus enterprise telemetry platform. The following prompts will implement each component:

1. **TCP Gateway** - Node.js server for GPS tracker connections
2. **Queue Split** - Separate ingestion from processing
3. **Durable Objects** - Realtime WebSocket engine
4. **Map Dashboard** - React frontend for live tracking
5. **Geofence Engine** - Polygon/circle geofence detection
6. **Driver Analytics** - Behavior scoring and safety
7. **Security Hardening** - Enterprise security measures
8. **Vulnerability Fixes** - npm dependency security
9. **Telemetry Archival** - Cost-effective storage pipeline

Each component will be built according to this architecture specification.
