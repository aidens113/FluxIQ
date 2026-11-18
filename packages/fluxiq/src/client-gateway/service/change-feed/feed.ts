import type { ClientGatewayAuditLog } from "../audit-log.ts";
import type { ClientGatewayEventBus } from "../event-bus.ts";
import type { CLIENT_GATEWAY_SECURITY_EVENT_TYPES } from "../security/index.ts";
import type { ClientGatewaySessionRegistry } from "../sessions.ts";
import type { ClientGatewayChangeKind } from "./kinds.ts";
import type { ClientGatewayChange, ClientGatewayChangeListener, ClientGatewayChangesPort } from "./types.ts";

/** The security events that are a change to pairings or trust, and the change each one is. `trust.issued` is recorded as a security event whatever its type. */
const AUDITED_CHANGES: Partial<Record<(typeof CLIENT_GATEWAY_SECURITY_EVENT_TYPES)[number] | "trust.issued", ClientGatewayChangeKind>> = {
  "session.paired": "pairing.approved",
  "pairing.dismissed": "pairing.denied",
  "pairing.withdrawn": "pairing.withdrawn",
  "pairing.refused": "pairing.refused",
  "session.enrolled": "client.paired",
  "trust.issued": "client.paired",
  "trust.revoked": "client.revoked",
  "enrolment.abandoned": "client.revoked"
};

type ChangeFeedCollaborators = {
  audit: ClientGatewayAuditLog;
  events: ClientGatewayEventBus;
  sessions: ClientGatewaySessionRegistry;
};

/**
 * Signals each change to the gateway's pairings and clients as it happens, so
 * a reader learns of one by push instead of reading the snapshot on a timer.
 *
 * It hears three sources, each the one place its change is already recorded:
 * the security events the audit delivers (an approval, a dismissal, a
 * withdrawal, a revocation, trust given without pairing), the event bus (a
 * session becoming ready or ending), and the pairing registry, which signals
 * the two changes nothing else records as they happen (a challenge created,
 * and one lapsing). A session under a channel scope is never signalled: no
 * reader outside its scope can see it.
 *
 * Changes in one synchronous turn are one signal, delivered once the turn
 * ends, so an approval -- which records its pairing and readies its session in
 * the same turn -- is read once, not twice.
 */
export class ClientGatewayChangeFeed implements ClientGatewayChangesPort {
  private readonly listeners = new Set<ClientGatewayChangeListener>();
  private readonly audit: ClientGatewayAuditLog;
  private readonly sessions: ClientGatewaySessionRegistry;
  private current = 0;
  // The first change of the turn waiting to be delivered.
  private pending: ClientGatewayChangeKind | undefined;

  constructor(collaborators: ChangeFeedCollaborators) {
    this.audit = collaborators.audit;
    this.sessions = collaborators.sessions;
    collaborators.audit.onSecurityEvent((entry) => {
      const kind = AUDITED_CHANGES[entry.type as keyof typeof AUDITED_CHANGES];
      if (kind !== undefined) this.signal(kind);
    });
    collaborators.events.subscribe((event) => {
      if (event.type !== "session.ready" && event.type !== "session.disconnected") return;
      if (this.sessions.get(event.session.sessionId)?.channelScope !== undefined) return;
      this.signal(event.type === "session.ready" ? "client.connected" : "client.disconnected");
    });
  }

  /** Records a change; it reaches the listeners once the current turn ends, with any others of the same turn. */
  signal(kind: ClientGatewayChangeKind): void {
    if (this.pending !== undefined) return;
    this.pending = kind;
    queueMicrotask(() => this.deliver());
  }

  subscribe(listener: ClientGatewayChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  version(): number {
    return this.current;
  }

  private deliver(): void {
    const kind = this.pending;
    this.pending = undefined;
    if (kind === undefined) return;
    this.current += 1;
    const change: ClientGatewayChange = Object.freeze({ kind, version: this.current });
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        this.audit.record("change_feed.listener_failed", "A pairing and client change listener failed; the change was still delivered to the others.", {
          kind,
          version: change.version,
          error: error instanceof Error ? error.name : "non_error"
        });
      }
    }
  }
}
