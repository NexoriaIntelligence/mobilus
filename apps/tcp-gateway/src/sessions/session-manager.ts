/**
 * Device Session Manager
 * Manages active GPS tracker connections with IMEI-based registry
 */

import { Redis, Socket } from 'ioredis';
import { TcpSocket } from 'net';
import { GatewayConfig } from '../index';

interface DeviceSession {
  imei: string;
  protocol: string;
  socket: TcpSocket;
  connectedAt: number;
  lastHeartbeat: number;
  packetCount: number;
}

export class SessionManager {
  private redis: Redis;
  private config: GatewayConfig;
  private sessions: Map<string, DeviceSession>;
  private heartbeatInterval: NodeJS.Timeout | null;

  constructor(redis: Redis, config: GatewayConfig) {
    this.redis = redis;
    this.config = config;
    this.sessions = new Map();
    this.startHeartbeatChecker();
  }

  async registerDevice(imei: string, socket: TcpSocket, protocol: string): Promise<void> {
    const session: DeviceSession = {
      imei,
      protocol,
      socket,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      packetCount: 0
    };

    this.sessions.set(imei, session);
    
    // Store in Redis for horizontal scaling
    await this.redis.hset(`session:${imei}`, {
      protocol,
      connectedAt: String(session.connectedAt),
      lastHeartbeat: String(session.lastHeartbeat)
    });
    
    await this.redis.set(`active-session:${imei}`, '1', 'EX', this.config.socketTimeout / 1000);
    await this.redis.sadd('active-sessions', imei);
  }

  async unregisterDevice(imei: string): Promise<void> {
    const session = this.sessions.get(imei);
    if (session) {
      session.socket.destroy();
      this.sessions.delete(imei);
    }

    await this.redis.del(`session:${imei}`);
    await this.redis.del(`active-session:${imei}`);
    await this.redis.srem('active-sessions', imei);
  }

  async updateHeartbeat(imei: string): Promise<void> {
    const session = this.sessions.get(imei);
    if (session) {
      session.lastHeartbeat = Date.now();
      session.packetCount++;
      
      await this.redis.hset(`session:${imei}`, {
        lastHeartbeat: String(session.lastHeartbeat),
        packetCount: String(session.packetCount)
      });
    }
  }

  getSession(imei: string): DeviceSession | undefined {
    return this.sessions.get(imei);
  }

  getActiveCount(): number {
    return this.sessions.size;
  }

  getAllSessions(): DeviceSession[] {
    return Array.from(this.sessions.values());
  }

  async disconnectDevice(imei: string): Promise<boolean> {
    const session = this.sessions.get(imei);
    if (!session) return false;
    
    session.socket.end();
    await this.unregisterDevice(imei);
    return true;
  }

  private startHeartbeatChecker(): void {
    this.heartbeatInterval = setInterval(async () => {
      const now = Date.now();
      const timeout = this.config.heartbeatInterval * 2;

      for (const [imei, session] of this.sessions.entries()) {
        if (now - session.lastHeartbeat > timeout) {
          console.warn(`Session timeout for IMEI: ${imei}`);
          await this.unregisterDevice(imei);
        }
      }
    }, this.config.heartbeatInterval);
  }

  async cleanup(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all sockets
    for (const [imei, session] of this.sessions.entries()) {
      session.socket.destroy();
    }
    this.sessions.clear();

    await this.redis.del('active-sessions');
  }
}
