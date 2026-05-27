/**
 * Protocol Detector and Decoder
 * Supports: Teltonika Codec8, GT06, TK103, Concox, Huabao
 */

import { HandshakeResult, PacketResult, NormalizedTelemetry } from '@mobilus/telemetry-types';

export class ProtocolDetector {
  private stats: Record<string, { packets: number; errors: number }> = {};

  detectProtocol(buffer: Buffer): string | null {
    if (buffer.length < 4) return null;

    // Teltonika Codec8 - starts with length bytes, has 0x08 codec ID
    if (buffer[0] === 0x00 && buffer[1] >= 0x0e && buffer.includes(0x08)) {
      return 'teltonika_codec8';
    }

    // GT06 - starts with 0x23 or 0x24
    if (buffer[0] === 0x23 || buffer[0] === 0x24) {
      return 'gt06';
    }

    // TK103 - starts with ( and has IMEI pattern
    if (buffer[0] === 0x28 && buffer.includes(Buffer.from('IMEI'))) {
      return 'tk103';
    }

    // Concox - starts with specific header patterns
    if ((buffer[0] === 0x78 || buffer[0] === 0x79) && buffer[1] !== undefined) {
      return 'concox';
    }

    // Huabao - starts with 0x23 followed by length
    if (buffer[0] === 0x23 && buffer[1] !== undefined) {
      return 'huabao';
    }

    return null;
  }

  async decodeHandshake(buffer: Buffer, protocol: string): Promise<HandshakeResult | null> {
    switch (protocol) {
      case 'teltonika_codec8':
        return this.decodeTeltonikaHandshake(buffer);
      case 'gt06':
        return this.decodeGT06Handshake(buffer);
      case 'tk103':
        return this.decodeTK103Handshake(buffer);
      case 'concox':
        return this.decodeConcoxHandshake(buffer);
      case 'huabao':
        return this.decodeHuabaoHandshake(buffer);
      default:
        return null;
    }
  }

  async decodePacket(buffer: Buffer, protocol: string): Promise<PacketResult | null> {
    switch (protocol) {
      case 'teltonika_codec8':
        return this.decodeTeltonikaPacket(buffer);
      case 'gt06':
        return this.decodeGT06Packet(buffer);
      case 'tk103':
        return this.decodeTK103Packet(buffer);
      case 'concox':
        return this.decodeConcoxPacket(buffer);
      case 'huabao':
        return this.decodeHuabaoPacket(buffer);
      default:
        return null;
    }
  }

  generateAck(result: HandshakeResult | PacketResult, protocol: string): Buffer {
    switch (protocol) {
      case 'teltonika_codec8':
        return this.generateTeltonikaAck(result as PacketResult);
      case 'gt06':
        return this.generateGT06Ack();
      case 'tk103':
        return this.generateTK103Ack();
      case 'concox':
        return this.generateConcoxAck();
      case 'huabao':
        return this.generateHuabaoAck();
      default:
        return Buffer.alloc(0);
    }
  }

  getStats(): Record<string, { packets: number; errors: number }> {
    return { ...this.stats };
  }

  // Teltonika Codec8 Implementation
  private decodeTeltonikaHandshake(buffer: Buffer): HandshakeResult | null {
    // Teltonika handshake is typically the first data packet with IMEI
    const result = this.decodeTeltonikaPacket(buffer);
    if (result?.telemetry?.imei) {
      return {
        imei: result.telemetry.imei,
        remaining: buffer.slice(result.consumedBytes)
      };
    }
    return null;
  }

  private decodeTeltonikaPacket(buffer: Buffer): PacketResult | null {
    if (buffer.length < 5) return null;

    try {
      let offset = 0;
      
      // Skip length byte if present
      if (buffer[0] === 0x00) {
        offset = 1;
      }

      // Read IMEI (8 bytes)
      const imeiBytes = buffer.slice(offset, offset + 8);
      const imei = imeiBytes.toString('hex');
      offset += 8;

      // Check for codec ID (should be 0x08 for Codec8)
      const codecId = buffer[offset];
      if (codecId !== 0x08) {
        this.recordError('teltonika_codec8');
        return { valid: false, consumedBytes: buffer.length };
      }
      offset++;

      // Read element count
      const elementCount = buffer[offset];
      offset++;

      // Parse AVL data records
      const telemetry = this.parseTeltonikaElements(buffer.slice(offset, offset + elementCount * 8));
      telemetry.imei = imei;

      this.recordPacket('teltonika_codec8');
      
      return {
        valid: true,
        requiresAck: true,
        telemetry,
        consumedBytes: offset + elementCount * 8
      };
    } catch (err) {
      this.recordError('teltonika_codec8');
      return { valid: false, consumedBytes: buffer.length };
    }
  }

  private parseTeltonikaElements(buffer: Buffer): NormalizedTelemetry {
    // Simplified parsing - in production would parse all elements
    return {
      timestamp: Date.now(),
      lat: buffer.readBigInt64BE(0) / 10000000,
      lng: buffer.readBigInt64BE(8) / 10000000,
      speed: buffer.length > 16 ? buffer.readUInt16BE(16) : 0,
      heading: buffer.length > 18 ? buffer.readUInt16BE(18) : 0,
      satellites: buffer.length > 20 ? buffer.readUInt8(20) : 0,
      signalStrength: buffer.length > 21 ? buffer.readUInt8(21) : 0
    };
  }

  private generateTeltonikaAck(result: PacketResult): Buffer {
    if (!result.telemetry) return Buffer.from([0x00, 0x00, 0x00, 0x00]);
    
    // Ack with same length as data received
    const ack = Buffer.alloc(4);
    ack.writeUInt32BE(1); // Number of records acknowledged
    return ack;
  }

  // GT06 Implementation
  private decodeGT06Handshake(buffer: Buffer): HandshakeResult | null {
    if (buffer.length < 14) return null;
    
    // GT06 login packet: 0x23 0x23 [length] [content] [checksum] 0x0d 0x0a
    if (buffer[0] !== 0x23 || buffer[1] !== 0x23) return null;

    const length = buffer[2];
    if (buffer.length < length + 6) return null;

    // Extract IMEI from content
    const imeiStart = 3;
    const imeiEnd = imeiStart + 15;
    const imei = buffer.slice(imeiStart, imeiEnd).toString('ascii').replace(/\D/g, '');

    return { imei, remaining: buffer.slice(length + 6) };
  }

  private decodeGT06Packet(buffer: Buffer): PacketResult | null {
    if (buffer.length < 10) return null;

    try {
      // Validate start and end markers
      if (buffer[0] !== 0x23 || buffer[1] !== 0x23) {
        return { valid: false, consumedBytes: 1 };
      }

      const length = buffer[2];
      if (buffer.length < length + 6) return null;

      // Parse GT06 data fields
      const telemetry: NormalizedTelemetry = {
        timestamp: this.parseGT06Timestamp(buffer.slice(3, 9)),
        lat: this.parseGT06Coordinate(buffer.slice(9, 13)),
        lng: this.parseGT06Coordinate(buffer.slice(13, 17)),
        speed: buffer[17] || 0,
        heading: buffer[18] || 0
      };

      this.recordPacket('gt06');
      
      return {
        valid: true,
        requiresAck: true,
        telemetry,
        consumedBytes: length + 6
      };
    } catch (err) {
      this.recordError('gt06');
      return { valid: false, consumedBytes: buffer.length };
    }
  }

  private generateGT06Ack(): Buffer {
    return Buffer.from([0x23, 0x23, 0x00, 0x05, 0x00, 0x80, 0x0d, 0x0a]);
  }

  private parseGT06Timestamp(buffer: Buffer): number {
    // YYMMDDHHmmss format
    const year = 2000 + buffer[0];
    const month = buffer[1];
    const day = buffer[2];
    const hour = buffer[3];
    const minute = buffer[4];
    const second = buffer[5];
    
    return new Date(year, month - 1, day, hour, minute, second).getTime();
  }

  private parseGT06Coordinate(buffer: Buffer): number {
    // DDMM.MMMM format
    const degrees = buffer.readUInt32BE(0) / 1000000;
    return Math.floor(degrees) + (degrees % 1) * 100 / 60;
  }

  // TK103 Implementation
  private decodeTK103Handshake(buffer: Buffer): HandshakeResult | null {
    const imeiMatch = buffer.toString('ascii').match(/IMEI(\d{15})/);
    if (imeiMatch) {
      return { imei: imeiMatch[1], remaining: Buffer.alloc(0) };
    }
    return null;
  }

  private decodeTK103Packet(buffer: Buffer): PacketResult | null {
    // Simplified TK103 parsing
    const str = buffer.toString('ascii');
    const latMatch = str.match(/N(\d+\.\d+)/);
    const lngMatch = str.match(/W(\d+\.\d+)/) || str.match(/E(\d+\.\d+)/);
    
    if (latMatch && lngMatch) {
      this.recordPacket('tk103');
      return {
        valid: true,
        requiresAck: true,
        telemetry: {
          timestamp: Date.now(),
          lat: parseFloat(latMatch[1]),
          lng: parseFloat(lngMatch[1]) * (str.includes('W') ? -1 : 1),
          speed: 0,
          heading: 0
        },
        consumedBytes: buffer.length
      };
    }
    
    return { valid: false, consumedBytes: buffer.length };
  }

  private generateTK103Ack(): Buffer {
    return Buffer.from('ON');
  }

  // Concox Implementation
  private decodeConcoxHandshake(buffer: Buffer): HandshakeResult | null {
    if (buffer.length < 12) return null;
    
    // Concox login: 0x78 0x78 [length] 0x01 [IMEI 8 bytes] [CRC] 0x0d 0x0a
    if (buffer[0] !== 0x78 || buffer[1] !== 0x78) return null;

    const imeiBytes = buffer.slice(5, 13);
    const imei = imeiBytes.toString('hex');

    return { imei, remaining: Buffer.alloc(0) };
  }

  private decodeConcoxPacket(buffer: Buffer): PacketResult | null {
    if (buffer.length < 15) return null;

    try {
      if (buffer[0] !== 0x78 || buffer[1] !== 0x78) {
        return { valid: false, consumedBytes: 1 };
      }

      const length = buffer[2];
      const command = buffer[3];

      // Location data command
      if (command === 0x12 || command === 0x13) {
        const telemetry: NormalizedTelemetry = {
          timestamp: this.parseConcoxTimestamp(buffer.slice(4, 10)),
          lat: this.parseConcoxCoordinate(buffer.slice(10, 14)),
          lng: this.parseConcoxCoordinate(buffer.slice(14, 18)),
          speed: buffer.length > 18 ? buffer[18] : 0,
          heading: buffer.length > 19 ? buffer[19] : 0
        };

        this.recordPacket('concox');
        
        return {
          valid: true,
          requiresAck: true,
          telemetry,
          consumedBytes: length + 6
        };
      }

      return { valid: false, consumedBytes: length + 6 };
    } catch (err) {
      this.recordError('concox');
      return { valid: false, consumedBytes: buffer.length };
    }
  }

  private generateConcoxAck(): Buffer {
    return Buffer.from([0x78, 0x78, 0x05, 0x00, 0x00, 0x0d, 0x0a]);
  }

  private parseConcoxTimestamp(buffer: Buffer): number {
    const year = 2000 + buffer[0];
    const month = buffer[1];
    const day = buffer[2];
    const hour = buffer[3];
    const minute = buffer[4];
    const second = buffer[5];
    
    return new Date(year, month - 1, day, hour, minute, second).getTime();
  }

  private parseConcoxCoordinate(buffer: Buffer): number {
    const value = buffer.readUInt32BE(0);
    return Math.floor(value / 1000000) + (value % 1000000) / 1000000 * 100 / 60;
  }

  // Huabao Implementation
  private decodeHuabaoHandshake(buffer: Buffer): HandshakeResult | null {
    if (buffer.length < 10) return null;
    
    // Huabao login: 0x23 [length] 0x01 [terminal ID]
    if (buffer[0] !== 0x23) return null;

    const terminalId = buffer.slice(3, 11).toString('hex');
    return { imei: terminalId, remaining: Buffer.alloc(0) };
  }

  private decodeHuabaoPacket(buffer: Buffer): PacketResult | null {
    // Simplified Huabao parsing
    if (buffer[0] !== 0x23) {
      return { valid: false, consumedBytes: 1 };
    }

    try {
      const length = buffer[1];
      if (buffer.length < length + 4) return null;

      const telemetry: NormalizedTelemetry = {
        timestamp: Date.now(),
        lat: 0,
        lng: 0,
        speed: 0,
        heading: 0
      };

      this.recordPacket('huabao');
      
      return {
        valid: true,
        requiresAck: true,
        telemetry,
        consumedBytes: length + 4
      };
    } catch (err) {
      this.recordError('huabao');
      return { valid: false, consumedBytes: buffer.length };
    }
  }

  private generateHuabaoAck(): Buffer {
    return Buffer.from([0x23, 0x03, 0x00, 0x0d, 0x0a]);
  }

  private recordPacket(protocol: string): void {
    if (!this.stats[protocol]) {
      this.stats[protocol] = { packets: 0, errors: 0 };
    }
    this.stats[protocol].packets++;
  }

  private recordError(protocol: string): void {
    if (!this.stats[protocol]) {
      this.stats[protocol] = { packets: 0, errors: 0 };
    }
    this.stats[protocol].errors++;
  }
}
