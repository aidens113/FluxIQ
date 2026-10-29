import { randomUUID } from "node:crypto";
import type { ClientGatewayAuditEntry } from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "../../core/index.ts";
import { isClientGatewaySecurityEventType, type ClientGatewaySecurityEventListener } from "./security/index.ts";

/** How many entries the audit keeps by default before the oldest is overwritten. */
export const CLIENT_GATEWAY_DEFAULT_AUDIT_LIMIT = 10_000;

/**
 * Record of gateway events, surfaced through `snapshot()`. A ring: it keeps
 * the newest `limit` entries and overwrites the oldest, each append O(1).
 * Security events (`./security/security-events.ts`) also go to every
 * `onSecurityEvent` listener as they are recorded, so what outlives the ring
 * is the listener's to keep.
 */
export class ClientGatewayAuditLog {
  private readonly entries: ClientGatewayAuditEntry[] = [];
  // Where the next entry goes once the ring is full; also the oldest entry's index.
  private head = 0;
  private readonly limit: number;
  private readonly now: () => number;
  private readonly securityListeners = new Set<ClientGatewaySecurityEventListener>();

  constructor(now: () => number, limit: number = CLIENT_GATEWAY_DEFAULT_AUDIT_LIMIT) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("client_gateway.audit_limit_invalid: auditLimit must be a positive whole number.");
    this.now = now;
    this.limit = limit;
  }

  record(type: string, message: string, metadata?: JsonObject): void {
    const entry = this.append(type, message, metadata);
    if (isClientGatewaySecurityEventType(type)) this.deliver(entry);
  }

  /** Records an entry that is a security event whatever its type: what the transport reports. */
  recordSecurity(type: string, message: string, metadata?: JsonObject): void {
    this.deliver(this.append(type, message, metadata));
  }

  /** The newest `limit` entries, oldest first. */
  recent(limit: number): ClientGatewayAuditEntry[] {
    const count = Math.max(0, Math.min(Math.trunc(limit), this.entries.length));
    if (this.entries.length < this.limit) return this.entries.slice(this.entries.length - count);
    const ordered: ClientGatewayAuditEntry[] = [];
    for (let offset = this.entries.length - count; offset < this.entries.length; offset += 1) {
      ordered.push(this.entries[(this.head + offset) % this.limit]!);
    }
    return ordered;
  }

  /** How many entries the ring holds now. */
  size(): number {
    return this.entries.length;
  }

  onSecurityEvent(listener: ClientGatewaySecurityEventListener): () => void {
    this.securityListeners.add(listener);
    return () => {
      this.securityListeners.delete(listener);
    };
  }

  private append(type: string, message: string, metadata: JsonObject | undefined): ClientGatewayAuditEntry {
    const entry: ClientGatewayAuditEntry = {
      id: randomUUID(),
      timestamp: this.now(),
      type,
      message,
      ...(metadata?.sessionId ? { sessionId: String(metadata.sessionId) } : {}),
      ...(metadata ? { metadata } : {})
    };
    if (this.entries.length < this.limit) {
      this.entries.push(entry);
    } else {
      this.entries[this.head] = entry;
      this.head = (this.head + 1) % this.limit;
    }
    return entry;
  }

  // A listener's failure is recorded as an ordinary audit entry, which is not
  // a security event, so it can never loop back into the listeners.
  private deliver(entry: ClientGatewayAuditEntry): void {
    if (this.securityListeners.size === 0) return;
    const event = forListeners(entry);
    for (const listener of [...this.securityListeners]) {
      try {
        const delivered = listener(event);
        if (delivered instanceof Promise) delivered.catch((error: unknown) => this.listenerFailed(entry, error));
      } catch (error) {
        this.listenerFailed(entry, error);
      }
    }
  }

  private listenerFailed(entry: ClientGatewayAuditEntry, error: unknown): void {
    this.append("audit.security_listener_failed", "A security event listener failed; the event is still in the audit log.", {
      eventId: entry.id,
      eventType: entry.type,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * The copy of an entry a security listener is handed: without its pairing
 * code, which a listener persists durably and which can still be pending (a
 * `pairing.refused` for a session that was not waiting leaves its challenge
 * open). The session id and client id still say which pairing it was.
 */
function forListeners(entry: ClientGatewayAuditEntry): ClientGatewayAuditEntry {
  if (entry.metadata?.pairingCode === undefined) return entry;
  const { pairingCode: _pairingCode, ...metadata } = entry.metadata;
  return { ...entry, metadata };
}
