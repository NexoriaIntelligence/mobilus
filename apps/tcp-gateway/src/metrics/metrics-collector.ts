/**
 * Metrics Collector - Internal metrics aggregation
 */

export class MetricsCollector {
  private connections = 0;
  private packetsReceived = 0;
  private bytesReceived = 0;
  private telemetryForwarded = 0;
  private invalidPackets = 0;
  private errors = 0;
  private rejectedConnections = 0;

  recordConnection(): void {
    this.connections++;
  }

  recordDisconnection(): void {
    this.connections--;
  }

  recordPacket(bytes: number): void {
    this.packetsReceived++;
    this.bytesReceived += bytes;
  }

  recordTelemetry(): void {
    this.telemetryForwarded++;
  }

  recordInvalidPacket(): void {
    this.invalidPackets++;
  }

  recordError(): void {
    this.errors++;
  }

  recordRejected(): void {
    this.rejectedConnections++;
  }

  getStats(): {
    connections: number;
    packetsReceived: number;
    bytesReceived: number;
    telemetryForwarded: number;
    invalidPackets: number;
    errors: number;
    rejectedConnections: number;
  } {
    return {
      connections: this.connections,
      packetsReceived: this.packetsReceived,
      bytesReceived: this.bytesReceived,
      telemetryForwarded: this.telemetryForwarded,
      invalidPackets: this.invalidPackets,
      errors: this.errors,
      rejectedConnections: this.rejectedConnections
    };
  }

  reset(): void {
    this.connections = 0;
    this.packetsReceived = 0;
    this.bytesReceived = 0;
    this.telemetryForwarded = 0;
    this.invalidPackets = 0;
    this.errors = 0;
    this.rejectedConnections = 0;
  }
}
