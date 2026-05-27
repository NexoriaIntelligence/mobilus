/**
 * Telemetry Forwarder with Retry Queue and Backpressure Handling
 */

import { Redis } from 'ioredis';
import { NormalizedTelemetry } from '@mobilus/telemetry-types';

export class TelemetryForwarder {
  private apiUrl: string;
  private redis: Redis;
  private retryQueueKey = 'telemetry:retry-queue';
  private batchSize = 100;
  private flushInterval: NodeJS.Timeout | null = null;
  private buffer: Array<NormalizedTelemetry & { receivedAt: number }> = [];

  constructor(apiUrl: string, redis: Redis) {
    this.apiUrl = apiUrl;
    this.redis = redis;
    this.startFlushInterval();
  }

  async forward(telemetry: NormalizedTelemetry & { receivedAt: number }): Promise<void> {
    this.buffer.push(telemetry);

    // Flush if batch size reached
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(async () => {
      if (this.buffer.length > 0) {
        await this.flush();
      }
      
      // Process retry queue
      await this.processRetryQueue();
    }, 1000);
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = [...this.buffer];
    this.buffer = [];

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telemetry: batch })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      // Add to retry queue on failure
      for (const item of batch) {
        await this.redis.lpush(this.retryQueueKey, JSON.stringify(item));
      }
    }
  }

  private async processRetryQueue(): Promise<void> {
    const retryItems: string[] = await this.redis.lrange(this.retryQueueKey, 0, this.batchSize - 1);
    
    if (retryItems.length === 0) return;

    try {
      const telemetry = retryItems.map(item => JSON.parse(item));
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telemetry })
      });

      if (response.ok) {
        // Remove processed items
        await this.redis.ltrim(this.retryQueueKey, retryItems.length, -1);
      }
    } catch (err) {
      // Items remain in queue for next retry
    }
  }

  async getQueueSize(): Promise<number> {
    return this.redis.llen(this.retryQueueKey);
  }

  async cleanup(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    // Final flush
    await this.flush();
  }
}
