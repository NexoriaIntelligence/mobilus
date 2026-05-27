# Mobilus Enterprise GPS Telemetry Platform

Enterprise-grade distributed GPS telemetry platform for massive fleet scale.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ GPS Trackers │────►│   TCP Gateway    │────►│ Ingestion Worker│
│  (50k conn)  │ TCP │   (Node.js)      │ HTTP│  (Cloudflare)   │
└──────────────┘     └──────────────────┘     └─────────────────┘
                            │                        │
                            ▼                        ▼
                     ┌──────────────┐         ┌─────────────────┐
                     │    Redis     │         │ Queue Processor │
                     │  (Sessions)  │         │   (Cloudflare)  │
                     └──────────────┘         └─────────────────┘
                                                    │
                    ┌───────────────────────────────┼───────────┐
                    ▼                               ▼           ▼
            ┌──────────────┐              ┌──────────────┐ ┌──────────┐
            │   Supabase   │              │  Realtime DO │ │ThingBoard│
            │ (PostgreSQL) │              │ (WebSocket)  │ │   IoT    │
            └──────────────┘              └──────────────┘ └──────────┘
```

## Monorepo Structure

```
mobilus/
├── apps/
│   ├── tcp-gateway/           # Node.js TCP server for GPS trackers
│   ├── telemetry-ingestion-worker/
│   ├── telemetry-processor-worker/
│   ├── realtime-service/      # Durable Objects WebSocket hub
│   └── map-dashboard/         # React fleet tracking UI
├── packages/
│   ├── telemetry-types/       # Shared TypeScript types
│   └── telemetry-security/    # Security utilities
└── infra/
    ├── docker/
    ├── k8s/
    └── monitoring/
```

## Quick Start

### Install Dependencies

```bash
pnpm install
```

### Run TCP Gateway

```bash
cd apps/tcp-gateway
pnpm dev
```

### Run Cloudflare Workers

```bash
cd apps/telemetry-ingestion-worker
pnpm dev

cd ../telemetry-processor-worker
pnpm dev

cd ../realtime-service
pnpm dev
```

### Run Dashboard

```bash
cd apps/map-dashboard
pnpm dev
```

### Docker Compose (Full Stack)

```bash
cd apps/tcp-gateway
docker-compose up -d
```

## Environment Variables

See individual app README files for configuration options.

## Scale Targets

- **100k vehicles** tracked simultaneously
- **500k websocket clients** for realtime updates
- **10k telemetry events/sec** ingestion capacity
- **Zero packet loss** with retry architecture

## Security Features

- HMAC payload signing
- Replay attack protection with nonce caching
- Rotating device tokens
- Rate limiting
- Input validation

## License

MIT
