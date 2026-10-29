import { randomUUID } from "node:crypto";
import type {
  ClientGatewayClientHello,
  ClientGatewaySession,
  ClientGatewaySocket,
  ClientGatewayTrustedClient
} from "@fluxiq/contracts/client-gateway";
import { normalizeClientGatewayPeer, type ClientGatewayPeer } from "./security/index.ts";
import type { InternalSession } from "./types.ts";

/**
 * How many ended (disconnected) sessions the registry keeps, and for how long.
 * Past either bound the oldest-disconnected is dropped. `maxAgeMs: null` keeps
 * them for as long as the count allows.
 */
export type ClientGatewaySessionRetention = {
  limit: number;
  maxAgeMs: number | null;
};

/** The defaults: at most 1,000 ended sessions, kept however old. */
export const CLIENT_GATEWAY_DEFAULT_SESSION_RETENTION: Readonly<ClientGatewaySessionRetention> = Object.freeze({ limit: 1000, maxAgeMs: null });

// How many dropped session ids are remembered, so a command or a message to
// one still fails as "disconnected" rather than "unknown". Oldest forgotten first.
const PRUNED_ID_MEMORY = 10_000;

const DISCONNECTED = "Client session is disconnected.";

/**
 * Owns the live session map. Holds no transport and raises no events, so every
 * other collaborator may depend on it without a cycle.
 *
 * Ended sessions are kept, bounded by `ClientGatewaySessionRetention`: each
 * one carries its outbound queue, so an unbounded map grew with every
 * reconnect. A dropped session's id is remembered (bounded too), and `require`
 * and `requireReady` refuse it as disconnected, as `requireReady` refused it
 * before it was dropped; `get` answers nothing for it, as for any id it never
 * knew.
 */
export class ClientGatewaySessionRegistry {
  private readonly sessions = new Map<string, InternalSession>();
  // Ended sessions in the order they ended, each with when; oldest first.
  private readonly ended = new Map<string, number>();
  private readonly pruned = new Set<string>();
  private readonly now: () => number;
  private readonly retention: ClientGatewaySessionRetention;

  constructor(now: () => number, retention: Partial<ClientGatewaySessionRetention> = {}) {
    this.now = now;
    this.retention = resolveRetention(retention);
  }

  create(input: { socket?: ClientGatewaySocket; hello?: ClientGatewayClientHello; peer?: ClientGatewayPeer }): InternalSession {
    this.pruneEnded();
    const now = this.now();
    const clientId = input.hello?.clientId ?? `client.${randomUUID()}`;
    const session: InternalSession = {
      sessionId: randomUUID(),
      clientId,
      clientType: input.hello?.clientType ?? "custom",
      name: input.hello?.name ?? clientId,
      ...(input.hello?.version ? { version: input.hello.version } : {}),
      status: "connected",
      connectedAt: now,
      lastSeenAt: now,
      capabilities: input.hello?.capabilities ?? [],
      ...(input.hello?.metadata ? { metadata: input.hello.metadata } : {}),
      ...(input.socket ? { socket: input.socket } : {}),
      ...(input.peer ? { peer: normalizeClientGatewayPeer(input.peer) } : {}),
      outbound: []
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  get(sessionId: string): InternalSession | undefined {
    return this.sessions.get(sessionId);
  }

  require(sessionId: string): InternalSession {
    const session = this.sessions.get(sessionId);
    if (session) return session;
    if (this.pruned.has(sessionId)) throw new Error(DISCONNECTED);
    throw new Error(`Unknown client gateway session: ${sessionId}`);
  }

  requireReady(sessionId: string): InternalSession {
    const session = this.require(sessionId);
    // A session whose socket has gone can never answer, so a command to it
    // fails here rather than waiting out its timeout.
    if (session.disconnectedAt !== undefined) throw new Error(DISCONNECTED);
    if (session.status !== "ready") throw new Error("Client session is not paired.");
    return session;
  }

  replace(sessionId: string, session: InternalSession): void {
    this.sessions.set(sessionId, session);
    if (session.disconnectedAt === undefined) return;
    // Ending a session again moves it to the newest end of the queue.
    this.ended.delete(sessionId);
    this.ended.set(sessionId, session.disconnectedAt);
    this.pruneEnded();
  }

  list(): InternalSession[] {
    this.pruneEnded();
    return [...this.sessions.values()];
  }

  size(): number {
    return this.sessions.size;
  }

  touch(session: InternalSession): void {
    session.lastSeenAt = this.now();
  }

  /** The session view callers outside the gateway are allowed to see. */
  toPublic(session: InternalSession): ClientGatewaySession {
    const { socket: _socket, outbound: _outbound, pendingPairingCode: _pendingPairingCode, channelScope: _channelScope, peer: _peer, ...publicSession } = session;
    return { ...publicSession };
  }

  /** A paired session of the trusted client that still has its socket, the one a token may act as. */
  findReadyByTrustedClient(trustedClientId: string): InternalSession | undefined {
    return this.list().find((candidate) => candidate.status === "ready" && candidate.disconnectedAt === undefined && candidate.trustedClientId === trustedClientId);
  }

  /** Every session still marked paired, live or not, so revoking or replacing one ends them all. */
  listReadyByTrustedClient(trustedClientId: string): InternalSession[] {
    return this.list().filter((candidate) => candidate.status === "ready" && candidate.trustedClientId === trustedClientId);
  }

  attachTrustedClient(session: InternalSession, trustedClient: ClientGatewayTrustedClient): void {
    session.status = "ready";
    session.trustedClientId = trustedClient.trustedClientId;
    session.operatorUserId = trustedClient.approvedByUserId;
    session.pairedAt ??= trustedClient.approvedAt;
  }

  /** Drops the oldest-ended sessions past the retention bounds; stops at the first one within them. */
  private pruneEnded(): void {
    const cutoff = this.retention.maxAgeMs === null ? undefined : this.now() - this.retention.maxAgeMs;
    for (const [sessionId, endedAt] of this.ended) {
      const overCount = this.ended.size > this.retention.limit;
      const overAge = cutoff !== undefined && endedAt <= cutoff;
      if (!overCount && !overAge) return;
      this.ended.delete(sessionId);
      // Only a session that is still ended is dropped; one replaced by a live record since is kept.
      if (this.sessions.get(sessionId)?.disconnectedAt === undefined) continue;
      this.sessions.delete(sessionId);
      this.rememberPruned(sessionId);
    }
  }

  private rememberPruned(sessionId: string): void {
    this.pruned.add(sessionId);
    if (this.pruned.size <= PRUNED_ID_MEMORY) return;
    const oldest = this.pruned.values().next().value;
    if (oldest !== undefined) this.pruned.delete(oldest);
  }
}

function resolveRetention(input: Partial<ClientGatewaySessionRetention>): ClientGatewaySessionRetention {
  const limit = input.limit ?? CLIENT_GATEWAY_DEFAULT_SESSION_RETENTION.limit;
  const maxAgeMs = input.maxAgeMs === undefined ? CLIENT_GATEWAY_DEFAULT_SESSION_RETENTION.maxAgeMs : input.maxAgeMs;
  if (!Number.isInteger(limit) || limit < 1) throw new Error("client_gateway.session_retention_invalid: endedSessionLimit must be a positive whole number.");
  if (maxAgeMs !== null && (!Number.isFinite(maxAgeMs) || maxAgeMs < 0)) {
    throw new Error("client_gateway.session_retention_invalid: endedSessionMaxAgeMs must be a non-negative number or null.");
  }
  return { limit, maxAgeMs };
}
