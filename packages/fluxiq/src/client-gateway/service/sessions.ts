import { randomUUID } from "node:crypto";
import type {
  ClientGatewayClientHello,
  ClientGatewaySession,
  ClientGatewaySocket,
  ClientGatewayTrustedClient
} from "@fluxiq/contracts/client-gateway";
import type { InternalSession } from "./types.ts";

/**
 * Owns the live session map. Holds no transport and raises no events, so every
 * other collaborator may depend on it without a cycle.
 */
export class ClientGatewaySessionRegistry {
  private readonly sessions = new Map<string, InternalSession>();
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  create(input: { socket?: ClientGatewaySocket; hello?: ClientGatewayClientHello }): InternalSession {
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
    if (!session) throw new Error(`Unknown client gateway session: ${sessionId}`);
    return session;
  }

  requireReady(sessionId: string): InternalSession {
    const session = this.require(sessionId);
    if (session.status !== "ready") throw new Error("Client session is not paired.");
    return session;
  }

  replace(sessionId: string, session: InternalSession): void {
    this.sessions.set(sessionId, session);
  }

  list(): InternalSession[] {
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
    const { socket: _socket, outbound: _outbound, pendingPairingCode: _pendingPairingCode, ...publicSession } = session;
    return { ...publicSession };
  }

  findReadyByTrustedClient(trustedClientId: string): InternalSession | undefined {
    return this.list().find((candidate) => candidate.status === "ready" && candidate.trustedClientId === trustedClientId);
  }

  listReadyByTrustedClient(trustedClientId: string): InternalSession[] {
    return this.list().filter((candidate) => candidate.status === "ready" && candidate.trustedClientId === trustedClientId);
  }

  attachTrustedClient(session: InternalSession, trustedClient: ClientGatewayTrustedClient): void {
    session.status = "ready";
    session.trustedClientId = trustedClient.trustedClientId;
    session.operatorUserId = trustedClient.approvedByUserId;
    session.pairedAt ??= trustedClient.approvedAt;
  }
}
