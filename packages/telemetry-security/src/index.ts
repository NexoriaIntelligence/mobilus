/**
 * Mobilus Telemetry Security Module
 * HMAC signing, replay protection, token rotation, validation
 */

import { v4 as uuidv4 } from 'uuid';

export interface SecurityConfig {
  hmacSecret: string;
  tokenExpiryMs: number;
  nonceCacheSize: number;
}

export class TelemetrySecurity {
  private config: SecurityConfig;
  private nonceCache: Set<string>;

  constructor(config: SecurityConfig) {
    this.config = config;
    this.nonceCache = new Set();
  }

  async signPayload(payload: Record<string, unknown>, nonce?: string): Promise<SignedPayload> {
    const timestamp = Date.now();
    const nonceValue = nonce || uuidv4();
    
    const dataToSign = JSON.stringify({
      ...payload,
      timestamp,
      nonce: nonceValue
    });

    const signature = await this.generateHMAC(dataToSign);

    return {
      payload,
      timestamp,
      nonce: nonceValue,
      signature
    };
  }

  async verifyPayload(signed: SignedPayload): Promise<VerificationResult> {
    const now = Date.now();
    
    // Check timestamp expiry
    if (now - signed.timestamp > this.config.tokenExpiryMs) {
      return { valid: false, reason: 'expired' };
    }

    // Check replay attack (nonce reuse)
    if (this.nonceCache.has(signed.nonce)) {
      return { valid: false, reason: 'replay_detected' };
    }

    // Verify signature
    const dataToVerify = JSON.stringify({
      ...signed.payload,
      timestamp: signed.timestamp,
      nonce: signed.nonce
    });

    const expectedSignature = await this.generateHMAC(dataToVerify);
    
    if (!this.constantTimeCompare(expectedSignature, signed.signature)) {
      return { valid: false, reason: 'invalid_signature' };
    }

    // Cache nonce to prevent replay
    this.cacheNonce(signed.nonce);

    return { valid: true, payload: signed.payload };
  }

  generateDeviceToken(imei: string): string {
    const timestamp = Date.now();
    const random = cryptoRandomBytes(16).toString('hex');
    return `${imei}.${timestamp}.${random}`;
  }

  validateDeviceToken(token: string): TokenValidationResult {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, reason: 'invalid_format' };
    }

    const [imei, timestampStr, _] = parts;
    const timestamp = parseInt(timestampStr, 10);
    
    if (isNaN(timestamp) || Date.now() - timestamp > this.config.tokenExpiryMs) {
      return { valid: false, reason: 'expired' };
    }

    return { valid: true, imei };
  }

  private async generateHMAC(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.config.hmacSecret);
    const dataBuffer = encoder.encode(data);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, dataBuffer);
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }

  private cacheNonce(nonce: string): void {
    this.nonceCache.add(nonce);
    
    if (this.nonceCache.size > this.config.nonceCacheSize) {
      const firstKey = this.nonceCache.values().next().value;
      this.nonceCache.delete(firstKey);
    }
  }
}

export interface SignedPayload {
  payload: Record<string, unknown>;
  timestamp: number;
  nonce: string;
  signature: string;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  payload?: Record<string, unknown>;
}

export interface TokenValidationResult {
  valid: boolean;
  reason?: string;
  imei?: string;
}

function cryptoRandomBytes(length: number): Buffer {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Buffer.from(array);
}

// Middleware factories
export function createAuthMiddleware(security: TelemetrySecurity) {
  return async (req: { headers: Record<string, string>; body: unknown }) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);
    const validation = security.validateDeviceToken(token);
    
    if (!validation.valid) {
      throw new Error(`Invalid token: ${validation.reason}`);
    }

    return { imei: validation.imei };
  };
}

export function createRateLimiter(maxRequests: number, windowMs: number) {
  const requests = new Map<string, number[]>();

  return (identifier: string): boolean => {
    const now = Date.now();
    const userRequests = requests.get(identifier) || [];
    
    const validRequests = userRequests.filter(t => now - t < windowMs);
    
    if (validRequests.length >= maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    requests.set(identifier, validRequests);
    
    return true;
  };
}
