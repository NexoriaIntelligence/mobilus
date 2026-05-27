/**
 * Mobilus TCP Gateway - Production-grade GPS tracker ingestion
 * Supports: Teltonika Codec8, GT06, TK103, Concox, Huabao
 */

import { fastify, FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pino from 'pino';
import { TCPServer } from './servers/tcp-server';
import { MetricsServer } from './metrics/metrics-server';
import { SessionManager } from './sessions/session-manager';
import { ProtocolDetector } from './protocols/detector';
import { TelemetryForwarder } from './middleware/forwarder';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { destination: 1 }
  }
});

export interface GatewayConfig {
  tcpPort: number;
  adminPort: number;
  metricsPort: number;
  redisUrl: string;
  telemetryApiUrl: string;
  maxConnections: number;
  socketTimeout: number;
  heartbeatInterval: number;
}

const DEFAULT_CONFIG: GatewayConfig = {
  tcpPort: parseInt(process.env.TCP_PORT || '5000'),
  adminPort: parseInt(process.env.ADMIN_PORT || '3000'),
  metricsPort: parseInt(process.env.METRICS_PORT || '9090'),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  telemetryApiUrl: process.env.TELEMETRY_API_URL || 'https://telemetry-api.mobilus.com/api/ingest',
  maxConnections: parseInt(process.env.MAX_CONNECTIONS || '50000'),
  socketTimeout: parseInt(process.env.SOCKET_TIMEOUT || '300000'),
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000')
};

export class TcpGateway {
  private config: GatewayConfig;
  private app: FastifyInstance;
  private redis: Redis;
  private sessionManager: SessionManager;
  private protocolDetector: ProtocolDetector;
  private telemetryForwarder: TelemetryForwarder;
  private tcpServer: TCPServer;
  private metricsServer: MetricsServer;
  private isRunning = false;

  constructor(config: Partial<GatewayConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.app = fastify({
      logger: {
        level: this.config.socketTimeout ? 'info' : 'silent'
      }
    });
    
    this.redis = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000)
    });
    
    this.sessionManager = new SessionManager(this.redis, this.config);
    this.protocolDetector = new ProtocolDetector();
    this.telemetryForwarder = new TelemetryForwarder(this.config.telemetryApiUrl, this.redis);
    this.tcpServer = new TCPServer(this.config, this.sessionManager, this.protocolDetector, this.telemetryForwarder, logger);
    this.metricsServer = new MetricsServer(this.config.metricsPort, logger);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Gateway is already running');
    }

    logger.info('Starting Mobilus TCP Gateway...');
    
    // Start admin API
    await this.setupAdminApi();
    await this.app.listen({ port: this.config.adminPort, host: '0.0.0.0' });
    logger.info(`Admin API listening on port ${this.config.adminPort}`);
    
    // Start metrics server
    await this.metricsServer.start();
    logger.info(`Metrics server listening on port ${this.config.metricsPort}`);
    
    // Start TCP server
    await this.tcpServer.start();
    logger.info(`TCP server listening on port ${this.config.tcpPort}`);
    
    this.isRunning = true;
    logger.info('Mobilus TCP Gateway started successfully');
  }

  private async setupAdminApi(): Promise<void> {
    // Health check
    this.app.get('/health', async () => ({
      status: 'healthy',
      uptime: process.uptime(),
      connections: this.sessionManager.getActiveCount(),
      timestamp: new Date().toISOString()
    }));

    // Readiness check
    this.app.get('/ready', async () => {
      const redisOk = await this.redis.ping().then(() => true).catch(() => false);
      return {
        ready: redisOk && this.isRunning,
        redis: redisOk ? 'connected' : 'disconnected'
      };
    });

    // Connection stats
    this.app.get('/stats', async () => ({
      activeConnections: this.sessionManager.getActiveCount(),
      maxConnections: this.config.maxConnections,
      protocols: this.protocolDetector.getStats(),
      memory: process.memoryUsage()
    }));

    // Force disconnect IMEI
    this.app.post('/disconnect/:imei', async (request, reply) => {
      const { imei } = request.params as { imei: string };
      const disconnected = await this.sessionManager.disconnectDevice(imei);
      if (!disconnected) {
        return reply.code(404).send({ error: 'Device not found' });
      }
      return { success: true, imei };
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    logger.info('Shutting down Mobilus TCP Gateway...');
    
    await this.tcpServer.stop();
    await this.app.close();
    await this.metricsServer.stop();
    await this.redis.quit();
    
    this.isRunning = false;
    logger.info('Gateway shutdown complete');
  }
}

// Main entry point
if (require.main === module) {
  const gateway = new TcpGateway();
  
  const shutdown = async (signal: string) => {
    logger.warn(`Received ${signal}, shutting down gracefully...`);
    await gateway.stop();
    process.exit(0);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  gateway.start().catch((err) => {
    logger.error(err, 'Failed to start gateway');
    process.exit(1);
  });
}
