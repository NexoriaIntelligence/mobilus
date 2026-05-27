# Mobilus TCP Gateway

Production-grade GPS TCP Gateway for enterprise fleet telemetry.

## Features

- **Multi-protocol support**: Teltonika Codec8, GT06, TK103, Concox, Huabao
- **High concurrency**: 50k+ simultaneous tracker connections
- **Redis-backed sessions**: Horizontal scaling support
- **Prometheus metrics**: Full observability
- **Retry queue**: Zero packet loss guarantee
- **Backpressure handling**: Graceful degradation under load

## Quick Start

### Development

```bash
pnpm install
pnpm dev
```

### Docker

```bash
docker-compose up -d
```

### PM2 (Production)

```bash
pnpm build
pm2 start ecosystem.config.js
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| TCP_PORT | 5000 | TCP listener port |
| ADMIN_PORT | 3000 | Admin API port |
| METRICS_PORT | 9090 | Prometheus metrics port |
| REDIS_URL | redis://localhost:6379 | Redis connection URL |
| TELEMETRY_API_URL | https://telemetry-api.mobilus.com/api/ingest | Ingestion endpoint |
| MAX_CONNECTIONS | 50000 | Max concurrent connections |
| SOCKET_TIMEOUT | 300000 | Socket timeout (ms) |
| HEARTBEAT_INTERVAL | 30000 | Heartbeat check interval (ms) |
| LOG_LEVEL | info | Log level |

## API Endpoints

- `GET /health` - Health check
- `GET /ready` - Readiness check
- `GET /stats` - Connection statistics
- `POST /disconnect/:imei` - Force disconnect device
- `GET /metrics` - Prometheus metrics

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ GPS Trackers │────►│   TCP Gateway    │────►│ Ingestion Worker│
│  (50k conn)  │ TCP │   (Node.js)      │ HTTP│  (Cloudflare)   │
└──────────────┘     └──────────────────┘     └─────────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │    Redis     │
                     │  (Sessions)  │
                     └──────────────┘
```

## Metrics

- `mobilus_tcp_connections_active` - Active connections
- `mobilus_packets_received_total` - Total packets received
- `mobilus_telemetry_forwarded_total` - Telemetry events forwarded
- `mobilus_invalid_packets_total` - Invalid packets rejected
- `mobilus_errors_total` - Total errors

## License

MIT
