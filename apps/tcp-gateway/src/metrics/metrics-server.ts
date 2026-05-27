/**
 * Prometheus Metrics Server
 */

import { createServer, Server } from 'http';
import { Logger } from 'pino';
import * as client from 'prom-client';

export class MetricsServer {
  private server: Server;
  private port: number;
  private logger: Logger;
  private register: client.Registry;

  // Metrics
  private connectionsActive: client.Gauge;
  private connectionsTotal: client.Counter;
  private packetsReceived: client.Counter;
  private bytesReceived: client.Counter;
  private telemetryForwarded: client.Counter;
  private invalidPackets: client.Counter;
  private errors: client.Counter;
  private rejectedConnections: client.Counter;
  private packetLatency: client.Histogram;
  private memoryUsage: client.Gauge;

  constructor(port: number, logger: Logger) {
    this.port = port;
    this.logger = logger.child({ component: 'metrics-server' });
    this.register = new client.Registry();
    
    // Enable default metrics (CPU, memory, GC)
    client.collectDefaultMetrics({ register: this.register });

    // Custom metrics
    this.connectionsActive = new client.Gauge({
      name: 'mobilus_tcp_connections_active',
      help: 'Number of active TCP connections'
    });

    this.connectionsTotal = new client.Counter({
      name: 'mobilus_tcp_connections_total',
      help: 'Total number of TCP connections'
    });

    this.packetsReceived = new client.Counter({
      name: 'mobilus_packets_received_total',
      help: 'Total number of packets received',
      labelNames: ['protocol']
    });

    this.bytesReceived = new client.Counter({
      name: 'mobilus_bytes_received_total',
      help: 'Total bytes received'
    });

    this.telemetryForwarded = new client.Counter({
      name: 'mobilus_telemetry_forwarded_total',
      help: 'Total telemetry events forwarded'
    });

    this.invalidPackets = new client.Counter({
      name: 'mobilus_invalid_packets_total',
      help: 'Total invalid packets rejected'
    });

    this.errors = new client.Counter({
      name: 'mobilus_errors_total',
      help: 'Total errors'
    });

    this.rejectedConnections = new client.Counter({
      name: 'mobilus_rejected_connections_total',
      help: 'Total rejected connections (max limit)'
    });

    this.packetLatency = new client.Histogram({
      name: 'mobilus_packet_latency_seconds',
      help: 'Packet processing latency',
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
    });

    this.memoryUsage = new client.Gauge({
      name: 'mobilus_memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type']
    });

    this.register.registerMetric(this.connectionsActive);
    this.register.registerMetric(this.connectionsTotal);
    this.register.registerMetric(this.packetsReceived);
    this.register.registerMetric(this.bytesReceived);
    this.register.registerMetric(this.telemetryForwarded);
    this.register.registerMetric(this.invalidPackets);
    this.register.registerMetric(this.errors);
    this.register.registerMetric(this.rejectedConnections);
    this.register.registerMetric(this.packetLatency);
    this.register.registerMetric(this.memoryUsage);

    this.server = createServer(async (req, res) => {
      if (req.url === '/metrics') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(await this.register.metrics());
      } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy' }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, '0.0.0.0', () => {
        this.logger.info(`Metrics server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  recordConnection(): void {
    this.connectionsActive.inc();
    this.connectionsTotal.inc();
  }

  recordDisconnection(): void {
    this.connectionsActive.dec();
  }

  recordPacket(bytes: number, protocol?: string): void {
    this.packetsReceived.inc({ protocol: protocol || 'unknown' });
    this.bytesReceived.inc(bytes);
  }

  recordTelemetry(): void {
    this.telemetryForwarded.inc();
  }

  recordInvalidPacket(): void {
    this.invalidPackets.inc();
  }

  recordError(): void {
    this.errors.inc();
  }

  recordRejected(): void {
    this.rejectedConnections.inc();
  }

  recordLatency(seconds: number): void {
    this.packetLatency.observe(seconds);
  }

  updateMemoryUsage(): void {
    const mem = process.memoryUsage();
    this.memoryUsage.set({ type: 'heap_used' }, mem.heapUsed);
    this.memoryUsage.set({ type: 'heap_total' }, mem.heapTotal);
    this.memoryUsage.set({ type: 'rss' }, mem.rss);
  }
}
