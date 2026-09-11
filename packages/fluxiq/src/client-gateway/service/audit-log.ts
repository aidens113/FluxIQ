import { randomUUID } from "node:crypto";
import type { ClientGatewayAuditEntry } from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "../../core/index.ts";

/** Append-only record of gateway events, surfaced through `snapshot()`. */
export class ClientGatewayAuditLog {
  private readonly entries: ClientGatewayAuditEntry[] = [];
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  record(type: string, message: string, metadata?: JsonObject): void {
    this.entries.push({
      id: randomUUID(),
      timestamp: this.now(),
      type,
      message,
      ...(metadata?.sessionId ? { sessionId: String(metadata.sessionId) } : {}),
      ...(metadata ? { metadata } : {})
    });
  }

  recent(limit: number): ClientGatewayAuditEntry[] {
    return this.entries.slice(-limit);
  }
}
