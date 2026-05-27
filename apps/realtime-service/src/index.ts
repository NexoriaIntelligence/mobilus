/**
 * Mobilus Realtime Service - Durable Objects WebSocket Hub
 * Scales to 500k websocket clients with vehicle rooms, presence tracking, and delta compression
 */

import { RealtimeEvent } from '@mobilus/telemetry-types';

interface Env {
  REALTIME_HUB: DurableObjectNamespace;
  ENVIRONMENT: string;
}

// Client connection state
interface ClientState {
  clientId: string;
  subscriptions: Set<string>; // room IDs
  lastHeartbeat: number;
  userAgent?: string;
}

// Room state
interface RoomState {
  id: string;
  members: Map<string, ClientState>;
  lastUpdate: number;
  buffer: RealtimeEvent[];
}

export class RealtimeHub {
  private state: DurableObjectState;
  private connections: Map<string, WebSocket>;
  private clientStates: Map<string, ClientState>;
  private rooms: Map<string, RoomState>;
  private heartbeatInterval: ReturnType<typeof setInterval> | null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.connections = new Map();
    this.clientStates = new Map();
    this.rooms = new Map();
    this.heartbeatInterval = null;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // HTTP API endpoints
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        connections: this.connections.size,
        rooms: this.rooms.size
      }));
    }

    if (url.pathname === '/stats') {
      return new Response(JSON.stringify({
        totalConnections: this.connections.size,
        totalRooms: this.rooms.size,
        roomStats: Array.from(this.rooms.entries()).map(([id, room]) => ({
          id,
          members: room.members.size,
          lastUpdate: room.lastUpdate
        }))
      }));
    }

    return new Response('Not Found', { status: 404 });
  }

  async queue(batch: MessageBatch<RealtimeEvent>): Promise<void> {
    for (const message of batch.messages) {
      await this.broadcastEvent(message.body);
    }
  }

  private handleWebSocketUpgrade(request: Request): Response {
    const [client, server] = Object.values(new WebSocketPair());
    const clientId = crypto.randomUUID();

    const clientState: ClientState = {
      clientId,
      subscriptions: new Set(),
      lastHeartbeat: Date.now(),
      userAgent: request.headers.get('User-Agent') || undefined
    };

    this.connections.set(clientId, server);
    this.clientStates.set(clientId, clientState);

    server.accept();
    server.serializeAttachment({ clientId, subscribedRooms: [] });

    // Send welcome message
    server.send(JSON.stringify({
      type: 'connected',
      clientId,
      timestamp: Date.now()
    }));

    // Start heartbeat monitoring
    this.startHeartbeat(clientId);

    // Handle incoming messages
    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        await this.handleClientMessage(clientId, data);
      } catch (err) {
        console.error('Error parsing client message:', err);
      }
    });

    // Handle disconnect
    server.addEventListener('close', () => {
      this.handleDisconnect(clientId);
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  private async handleClientMessage(clientId: string, data: Record<string, unknown>): Promise<void> {
    const clientState = this.clientStates.get(clientId);
    if (!clientState) return;

    switch (data.type) {
      case 'subscribe':
        await this.subscribeToRoom(clientId, data.roomId as string);
        break;

      case 'unsubscribe':
        await this.unsubscribeFromRoom(clientId, data.roomId as string);
        break;

      case 'heartbeat':
        clientState.lastHeartbeat = Date.now();
        break;

      case 'get_presence':
        await this.sendPresence(clientId, data.roomId as string);
        break;
    }
  }

  private async subscribeToRoom(clientId: string, roomId: string): Promise<void> {
    const clientState = this.clientStates.get(clientId);
    if (!clientState) return;

    // Create room if doesn't exist
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        members: new Map(),
        lastUpdate: Date.now(),
        buffer: []
      });
    }

    const room = this.rooms.get(roomId)!;
    room.members.set(clientId, clientState);
    clientState.subscriptions.add(roomId);

    // Send buffered events
    if (room.buffer.length > 0) {
      const ws = this.connections.get(clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        for (const event of room.buffer.slice(-50)) {
          ws.send(JSON.stringify(event));
        }
      }
    }

    // Acknowledge subscription
    const ws = this.connections.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'subscribed',
        roomId,
        timestamp: Date.now()
      }));
    }
  }

  private async unsubscribeFromRoom(clientId: string, roomId: string): Promise<void> {
    const clientState = this.clientStates.get(clientId);
    if (!clientState) return;

    const room = this.rooms.get(roomId);
    if (room) {
      room.members.delete(clientId);
      
      // Clean up empty rooms
      if (room.members.size === 0) {
        this.rooms.delete(roomId);
      }
    }

    clientState.subscriptions.delete(roomId);
  }

  private async broadcastEvent(event: RealtimeEvent): Promise<void> {
    const targetRooms = this.getRoomsForEvent(event);
    
    for (const roomId of targetRooms) {
      const room = this.rooms.get(roomId);
      if (!room) continue;

      // Add to buffer (keep last 100 events)
      room.buffer.push(event);
      if (room.buffer.length > 100) {
        room.buffer.shift();
      }
      room.lastUpdate = Date.now();

      // Broadcast to all room members
      for (const [clientId, _] of room.members) {
        const ws = this.connections.get(clientId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify(event));
          } catch (err) {
            console.error('Error sending to client:', err);
          }
        }
      }
    }
  }

  private getRoomsForEvent(event: RealtimeEvent): string[] {
    const rooms = new Set<string>();

    // Always send to vehicle-specific room
    rooms.add(`vehicle:${event.vehicleId}`);

    // Send to agency room if present
    if (event.agencyId) {
      rooms.add(`agency:${event.agencyId}`);
    }

    // Send to global room for certain event types
    if (['alert_created', 'geofence_enter', 'geofence_exit'].includes(event.type)) {
      rooms.add('alerts:global');
    }

    return Array.from(rooms);
  }

  private async sendPresence(clientId: string, roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    const ws = this.connections.get(clientId);
    
    if (!room || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: 'presence',
      roomId,
      members: Array.from(room.members.keys()),
      count: room.members.size,
      timestamp: Date.now()
    }));
  }

  private startHeartbeat(clientId: string): void {
    const checkHeartbeat = () => {
      const clientState = this.clientStates.get(clientId);
      if (!clientState) return;

      const now = Date.now();
      const timeout = 60000; // 60 seconds

      if (now - clientState.lastHeartbeat > timeout) {
        console.warn(`Client ${clientId} heartbeat timeout`);
        this.handleDisconnect(clientId);
        return;
      }

      // Send heartbeat ping
      const ws = this.connections.get(clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', timestamp: now }));
      }
    };

    // Check every 15 seconds
    const interval = setInterval(checkHeartbeat, 15000);
    
    // Store interval reference for cleanup
    if (!this.heartbeatInterval) {
      this.heartbeatInterval = setInterval(() => {
        for (const clientId of this.connections.keys()) {
          checkHeartbeat();
        }
      }, 15000);
    }
  }

  private handleDisconnect(clientId: string): void {
    const clientState = this.clientStates.get(clientId);
    if (!clientState) return;

    // Remove from all rooms
    for (const roomId of clientState.subscriptions) {
      const room = this.rooms.get(roomId);
      if (room) {
        room.members.delete(clientId);
        
        if (room.members.size === 0) {
          this.rooms.delete(roomId);
        }
      }
    }

    // Close WebSocket
    const ws = this.connections.get(clientId);
    if (ws) {
      ws.close();
      this.connections.delete(clientId);
    }

    this.clientStates.delete(clientId);
  }

  async alarm(): Promise<void> {
    // Cleanup stale connections periodically
    const now = Date.now();
    const timeout = 120000; // 2 minutes

    for (const [clientId, state] of this.clientStates.entries()) {
      if (now - state.lastHeartbeat > timeout) {
        this.handleDisconnect(clientId);
      }
    }

    // Set next alarm
    this.state.storage.setAlarm(Date.now() + 60000);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.REALTIME_HUB.idFromName('global');
    const hub = env.REALTIME_HUB.get(id);
    return hub.fetch(request);
  },

  async queue(batch: MessageBatch<RealtimeEvent>, env: Env): Promise<void> {
    const id = env.REALTIME_HUB.idFromName('global');
    const hub = env.REALTIME_HUB.get(id);
    return hub.queue(batch);
  }
};
