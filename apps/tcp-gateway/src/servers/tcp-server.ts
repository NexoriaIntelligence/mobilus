/**
 * TCP Socket Server for GPS Tracker Connections
 * Handles raw TCP connections with keepalive, heartbeat tracking, and idle timeout
 */

import { createServer, Server, Socket } from 'net';
import { Logger } from 'pino';
import { GatewayConfig } from '../index';
import { SessionManager } from '../sessions/session-manager';
import { ProtocolDetector } from '../protocols/detector';
import { TelemetryForwarder } from '../middleware/forwarder';
import { MetricsCollector } from './metrics-collector';

export class TCPServer {
  private server: Server;
  private config: GatewayConfig;
  private sessionManager: SessionManager;
  private protocolDetector: ProtocolDetector;
  private telemetryForwarder: TelemetryForwarder;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private connectionCount = 0;

  constructor(
    config: GatewayConfig,
    sessionManager: SessionManager,
    protocolDetector: ProtocolDetector,
    telemetryForwarder: TelemetryForwarder,
    logger: Logger
  ) {
    this.config = config;
    this.sessionManager = sessionManager;
    this.protocolDetector = protocolDetector;
    this.telemetryForwarder = telemetryForwarder;
    this.logger = logger.child({ component: 'tcp-server' });
    this.metricsCollector = new MetricsCollector();
    this.server = createServer();
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.on('connection', (socket) => this.handleConnection(socket));
      this.server.on('error', (err) => {
        this.logger.error(err, 'TCP server error');
        reject(err);
      });
      this.server.listen(this.config.tcpPort, '0.0.0.0', () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('TCP server closed');
        resolve();
      });
      
      // Force close after timeout
      setTimeout(() => {
        this.server.closeAllConnections();
        resolve();
      }, 5000);
    });
  }

  private handleConnection(socket: Socket): void {
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    this.logger.debug({ remoteAddr }, 'New TCP connection');

    // Connection limit check
    if (this.connectionCount >= this.config.maxConnections) {
      this.logger.warn({ remoteAddr }, 'Max connections reached, rejecting');
      socket.destroy();
      this.metricsCollector.recordRejected();
      return;
    }

    this.connectionCount++;
    this.metricsCollector.recordConnection();

    let imei: string | null = null;
    let protocol: string | null = null;
    let buffer = Buffer.alloc(0);
    let lastActivity = Date.now();

    // Socket configuration
    socket.setKeepAlive(true, 60000);
    socket.setTimeout(this.config.socketTimeout);

    // Activity tracking
    const updateActivity = () => {
      lastActivity = Date.now();
    };

    socket.on('data', async (data: Buffer) => {
      updateActivity();
      this.metricsCollector.recordPacket(data.length);

      try {
        // Append to buffer for fragmented packet handling
        buffer = Buffer.concat([buffer, data]);

        // Wait for handshake if no IMEI yet
        if (!imei) {
          const handshakeResult = await this.handleHandshake(socket, buffer);
          if (handshakeResult) {
            imei = handshakeResult.imei;
            protocol = handshakeResult.protocol;
            buffer = handshakeResult.remaining;
            
            this.logger.info({ imei, protocol, remoteAddr }, 'Device authenticated');
            await this.sessionManager.registerDevice(imei, socket, protocol);
          }
          return;
        }

        // Process data packets
        if (imei && buffer.length > 0) {
          await this.handleDataPackets(socket, imei, protocol!, buffer);
        }
      } catch (err) {
        this.logger.error({ err, imei, remoteAddr }, 'Error processing packet');
        this.metricsCollector.recordError();
      }
    });

    socket.on('timeout', () => {
      this.logger.warn({ imei, remoteAddr }, 'Socket timeout');
      socket.end();
    });

    socket.on('error', (err) => {
      this.logger.error({ err, imei, remoteAddr }, 'Socket error');
      this.metricsCollector.recordError();
    });

    socket.on('close', async () => {
      this.connectionCount--;
      this.metricsCollector.recordDisconnection();
      this.logger.info({ imei, remoteAddr }, 'Connection closed');
      
      if (imei) {
        await this.sessionManager.unregisterDevice(imei);
      }
    });
  }

  private async handleHandshake(
    socket: Socket,
    buffer: Buffer
  ): Promise<{ imei: string; protocol: string; remaining: Buffer } | null> {
    // Detect protocol from initial bytes
    const detectedProtocol = this.protocolDetector.detectProtocol(buffer);
    
    if (!detectedProtocol) {
      this.logger.warn({ bufferSize: buffer.length }, 'Unknown protocol, waiting for more data');
      return null;
    }

    // Decode handshake based on protocol
    const handshake = await this.protocolDetector.decodeHandshake(buffer, detectedProtocol);
    
    if (!handshake || !handshake.imei) {
      this.logger.warn({ protocol: detectedProtocol }, 'Invalid handshake');
      socket.destroy();
      return null;
    }

    // Send ACK response
    const ack = this.protocolDetector.generateAck(handshake, detectedProtocol);
    socket.write(ack);

    return {
      imei: handshake.imei,
      protocol: detectedProtocol,
      remaining: handshake.remaining || Buffer.alloc(0)
    };
  }

  private async handleDataPackets(
    socket: Socket,
    imei: string,
    protocol: string,
    buffer: Buffer
  ): Promise<void> {
    let offset = 0;

    while (offset < buffer.length) {
      const packetResult = await this.protocolDetector.decodePacket(
        buffer.slice(offset),
        protocol
      );

      if (!packetResult) {
        // Incomplete packet, wait for more data
        break;
      }

      if (packetResult.valid) {
        // Send ACK for valid packets
        if (packetResult.requiresAck) {
          const ack = this.protocolDetector.generateAck(packetResult, protocol);
          socket.write(ack);
        }

        // Forward normalized telemetry
        if (packetResult.telemetry) {
          await this.telemetryForwarder.forward({
            ...packetResult.telemetry,
            imei,
            protocol,
            receivedAt: Date.now()
          });
          
          this.metricsCollector.recordTelemetry();
        }
      } else {
        this.logger.warn({ imei, protocol }, 'Invalid packet rejected');
        this.metricsCollector.recordInvalidPacket();
      }

      offset += packetResult.consumedBytes;
    }
  }
}
