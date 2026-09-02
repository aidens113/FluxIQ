import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { JsonObject } from "../core/index.ts";
import type {
  ClientGatewayActionCommand,
  ClientGatewayActionResponse,
  ClientGatewayActionResult,
  ClientGatewayAuditEntry,
  ClientGatewayClientHello,
  ClientGatewayClientMessage,
  ClientGatewayEvent,
  ClientGatewayEventHandler,
  ClientGatewayPairingChallenge,
  ClientGatewayServerMessage,
  ClientGatewaySession,
  ClientGatewaySocket,
  ClientGatewaySnapshotView,
  ClientGatewayTrustedClient,
  ClientGatewayTrustedClientView
} from "./contracts.ts";
import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "./contracts.ts";

export type ClientGatewayServiceOptions = {
  enabled?: boolean;
  publicUrl?: string;
  pairingTtlMs?: number;
  commandTimeoutMs?: number;
  trustedClientTtlMs?: number;
  trustedClientStore?: ClientGatewayTrustedClientStore;
  createToken?: () => string;
  now?: () => number;
};

export type ClientGatewayTrustedClientStore = {
  load(): Promise<ClientGatewayTrustedClient[]>;
  save(clients: ClientGatewayTrustedClient[]): Promise<void>;
};

type InternalSession = ClientGatewaySession & {
  socket?: ClientGatewaySocket;
  outbound: ClientGatewayServerMessage[];
  pendingPairingCode?: string;
};

type PendingCommand = {
  sessionId: string;
  resolve(result: ClientGatewayActionResult): void;
  timeout: ReturnType<typeof setTimeout>;
};

export type ClientGatewayItemKind = "sessions" | "pairings" | "trustedClients";
export type ClientGatewaySummaryItem = ClientGatewaySession | ClientGatewayPairingChallenge | ClientGatewayTrustedClientView;
export type ClientGatewaySummaryPage = { items: ClientGatewaySummaryItem[]; total: number; limit: number; lastId: string | null; hasMore: boolean };

export class ClientGatewayService {
  private readonly enabled: boolean;
  private readonly publicUrl: string | undefined;
  private readonly pairingTtlMs: number;
  private readonly commandTimeoutMs: number;
  private readonly trustedClientTtlMs: number;
  private readonly trustedClientStore: ClientGatewayTrustedClientStore | undefined;
  private readonly createToken: () => string;
  private readonly now: () => number;
  private readonly sessions = new Map<string, InternalSession>();
  private readonly pairings = new Map<string, ClientGatewayPairingChallenge>();
  private readonly trustedClients = new Map<string, ClientGatewayTrustedClient>();
  private readonly trustedClientByTokenHash = new Map<string, string>();
  private readonly pendingCommands = new Map<string, PendingCommand>();
  private readonly handlers = new Set<ClientGatewayEventHandler>();
  private readonly auditLog: ClientGatewayAuditEntry[] = [];
  private readonly trustedClientsReady: Promise<void>;
  private trustedClientsLoadError: unknown;

  constructor(options: ClientGatewayServiceOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.publicUrl = options.publicUrl;
    this.pairingTtlMs = options.pairingTtlMs ?? 5 * 60_000;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 30_000;
    this.trustedClientTtlMs = options.trustedClientTtlMs ?? 30 * 24 * 60 * 60_000;
    this.trustedClientStore = options.trustedClientStore;
    this.createToken = options.createToken ?? (() => randomBytes(32).toString("base64url"));
    this.now = options.now ?? Date.now;
    this.trustedClientsReady = this.loadTrustedClients().catch((error: unknown) => {
      this.trustedClientsLoadError = error;
    });
  }

  async ready(): Promise<void> {
    await this.trustedClientsReady;
    if (this.trustedClientsLoadError) throw this.trustedClientsLoadError;
  }

  snapshot(): ClientGatewaySnapshotView {
    this.pruneExpiredPairings();
    return {
      enabled: this.enabled,
      ...(this.publicUrl ? { publicUrl: this.publicUrl } : {}),
      sessions: [...this.sessions.values()].map(({ socket: _socket, outbound: _outbound, pendingPairingCode: _pendingPairingCode, ...session }) => ({ ...session })),
      pairings: [...this.pairings.values()],
      trustedClients: [...this.trustedClients.values()].map((client) => this.publicTrustedClient(client)),
      auditLog: this.auditLog.slice(-100)
    };
  }

  summary(): { enabled: boolean; publicUrl?: string; counts: Record<ClientGatewayItemKind, number> } {
    this.pruneExpiredPairings();
    return {
      enabled: this.enabled,
      ...(this.publicUrl ? { publicUrl: this.publicUrl } : {}),
      counts: { sessions: this.sessions.size, pairings: this.pairings.size, trustedClients: this.trustedClients.size }
    };
  }

  listSummaryItems(input: { kind: ClientGatewayItemKind; afterId?: string | null; limit?: number; search?: string } ): ClientGatewaySummaryPage {
    this.pruneExpiredPairings();
    const idOf = input.kind === "sessions"
      ? (item: ClientGatewaySummaryItem) => (item as ClientGatewaySession).sessionId
      : input.kind === "pairings"
        ? (item: ClientGatewaySummaryItem) => (item as ClientGatewayPairingChallenge).pairingCode
        : (item: ClientGatewaySummaryItem) => (item as ClientGatewayTrustedClientView).trustedClientId;
    const source: ClientGatewaySummaryItem[] = input.kind === "sessions"
      ? [...this.sessions.values()].map((session) => this.publicSession(session))
      : input.kind === "pairings"
        ? [...this.pairings.values()].map((pairing) => ({ ...pairing }))
        : [...this.trustedClients.values()].map((client) => this.publicTrustedClient(client));
    const search = input.search?.trim().toLowerCase() ?? "";
    const limit = Math.max(1, Math.min(200, Math.trunc(input.limit ?? 50) || 50));
    const filtered = source.filter((item) => !search || Object.values(item).some((value) => typeof value === "string" && value.toLowerCase().includes(search)))
      .sort((left, right) => idOf(left).localeCompare(idOf(right)));
    const after = input.afterId ? filtered.filter((item) => idOf(item) > input.afterId!) : filtered;
    const items = after.slice(0, limit);
    return { items, total: filtered.length, limit, lastId: items.at(-1) ? idOf(items.at(-1)!) : null, hasMore: after.length > limit };
  }

  async authorizeToken(token: string | null | undefined): Promise<ClientGatewaySession | null> {
    await this.ready();
    const normalizedToken = typeof token === "string" ? token.trim() : "";
    if (!normalizedToken) return null;
    const trustedClientId = this.trustedClientByTokenHash.get(this.hashToken(normalizedToken));
    if (!trustedClientId) return null;
    const trustedClient = this.trustedClients.get(trustedClientId);
    if (!trustedClient || !this.isTrustedClientActive(trustedClient)) return null;
    const session = [...this.sessions.values()].find((candidate) => candidate.status === "ready" && candidate.trustedClientId === trustedClientId);
    if (!session) return null;
    session.lastSeenAt = this.now();
    return this.publicSession(session);
  }

  createPairing(input: {
    projectId?: string | null;
    userId?: string;
    ttlMs?: number;
    requestedBySessionId?: string;
    requestedByClientId?: string;
    requestedByClientName?: string;
  } = {}): ClientGatewayPairingChallenge {
    const pairingCode = this.createPairingCode();
    const pairing: ClientGatewayPairingChallenge = {
      pairingCode,
      referenceCode: pairingCode,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.requestedBySessionId !== undefined ? { requestedAt: this.now(), requestedBySessionId: input.requestedBySessionId } : {}),
      ...(input.requestedByClientId !== undefined ? { requestedByClientId: input.requestedByClientId } : {}),
      ...(input.requestedByClientName !== undefined ? { requestedByClientName: input.requestedByClientName } : {}),
      expiresAt: this.now() + (input.ttlMs ?? this.pairingTtlMs)
    };
    this.pairings.set(pairingCode, pairing);
    this.audit("pairing.created", "Client pairing challenge created.", { pairingCode, projectId: input.projectId ?? null });
    return pairing;
  }

  async approvePairing(pairingCode: string, input: { approvedByUserId: string }): Promise<ClientGatewaySession | null> {
    await this.ready();
    this.pruneExpiredPairings();
    const pairing = this.pairings.get(pairingCode);
    if (!pairing || pairing.consumedAt || !pairing.requestedBySessionId) return null;
    const approvedByUserId = input.approvedByUserId.trim();
    if (!approvedByUserId) throw new Error("Approving operator is required.");
    return this.completePairing(pairing.requestedBySessionId, pairingCode, approvedByUserId);
  }

  async revokeTrustedClient(trustedClientId: string, reason = "revoked by operator"): Promise<boolean> {
    await this.ready();
    const trustedClient = this.trustedClients.get(trustedClientId);
    if (!trustedClient || trustedClient.revokedAt) return false;
    const now = this.now();
    const previousUpdatedAt = trustedClient.updatedAt;
    trustedClient.revokedAt = now;
    trustedClient.revocationReason = reason;
    trustedClient.updatedAt = now;
    this.trustedClientByTokenHash.delete(trustedClient.tokenHash);
    try {
      await this.persistTrustedClients();
    } catch (error) {
      delete trustedClient.revokedAt;
      delete trustedClient.revocationReason;
      trustedClient.updatedAt = previousUpdatedAt;
      this.trustedClientByTokenHash.set(trustedClient.tokenHash, trustedClient.trustedClientId);
      throw error;
    }
    for (const session of this.sessions.values()) {
      if (session.status !== "ready" || session.trustedClientId !== trustedClientId) continue;
      await this.send(session.sessionId, this.serverMessage("server.disconnect", { reason: "Client trust was revoked." }, session));
      this.disconnect(session.sessionId, "client trust revoked");
    }
    this.audit("trust.revoked", "Trusted client access revoked.", { trustedClientId, clientId: trustedClient.clientId, reason });
    return true;
  }

  dismissPairing(pairingCode: string): boolean {
    const pairing = this.pairings.get(pairingCode);
    if (!pairing) return false;
    this.pairings.delete(pairingCode);
    if (pairing.requestedBySessionId) {
      const session = this.sessions.get(pairing.requestedBySessionId);
      if (session?.pendingPairingCode === pairingCode) delete session.pendingPairingCode;
      if (session && session.status === "pairing_required") {
        void this.send(session.sessionId, this.serverMessage("server.error", {
          message: "Client pairing request was rejected in FluxIQ.",
          code: "pairing.rejected"
        }, session));
      }
    }
    this.audit("pairing.dismissed", "Client pairing challenge dismissed.", {
      pairingCode,
      sessionId: pairing.requestedBySessionId ?? pairing.sessionId ?? null,
      clientId: pairing.requestedByClientId ?? null
    });
    return true;
  }

  connect(input: { socket?: ClientGatewaySocket; hello?: ClientGatewayClientHello } = {}): ClientGatewaySession {
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
    this.audit("session.connected", "Client connected.", { sessionId: session.sessionId, clientId });
    if (input.hello) void this.handleHello(session.sessionId, input.hello);
    return this.publicSession(session);
  }

  disconnect(sessionId: string, reason = "disconnected"): ClientGatewaySession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const next: InternalSession = { ...session, status: "disconnected", disconnectedAt: this.now(), lastSeenAt: this.now() };
    this.sessions.set(sessionId, next);
    void next.socket?.close?.(1000, reason);
    this.audit("session.disconnected", "Client disconnected.", { sessionId, reason });
    void this.emit({ type: "session.disconnected", session: this.publicSession(next) });
    return this.publicSession(next);
  }

  onEvent(handler: ClientGatewayEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async receiveRaw(sessionId: string, rawMessage: string): Promise<void> {
    const parsed = JSON.parse(rawMessage) as ClientGatewayClientMessage;
    await this.receive(sessionId, parsed);
  }

  async receive(sessionId: string, message: ClientGatewayClientMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown client gateway session: ${sessionId}`);
    session.lastSeenAt = this.now();
    if (message.type === "client.hello") {
      await this.handleHello(sessionId, message.payload);
      return;
    }
    if (message.type === "client.pairing_submit") {
      await this.submitPairing(sessionId, message.payload.pairingCode);
      return;
    }
    if (session.status !== "ready") {
      await this.send(sessionId, this.serverMessage("server.pairing_required", { reason: "Session must pair before sending client data." }, session));
      return;
    }
    if (message.type === "client.capabilities") {
      session.capabilities = message.payload.capabilities;
      return;
    }
    if (message.type === "client.state_update") {
      session.stateUpdate = message.payload;
      await this.emit({ type: "client.state_update", session: this.publicSession(session), message });
      return;
    }
    if (message.type === "client.start_recording") {
      await this.emit({ type: "client.start_recording", session: this.publicSession(session), message });
      return;
    }
    if (message.type === "client.stop_recording") {
      await this.emit({ type: "client.stop_recording", session: this.publicSession(session), message });
      session.activeRecordingId = null;
      return;
    }
    if (message.type === "client.recording_entry") {
      await this.emit({ type: "client.recording_entry", session: this.publicSession(session), message });
      return;
    }
    if (message.type === "client.recording_event") {
      await this.emit({ type: "client.recording_event", session: this.publicSession(session), message });
      return;
    }
    if (message.type === "client.snapshot") {
      await this.emit({ type: "client.snapshot", session: this.publicSession(session), message });
      return;
    }
    if (message.type === "client.action_result") {
      const pending = this.pendingCommands.get(message.payload.commandId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(message.payload.commandId);
        pending.resolve(message.payload);
      }
      await this.emit({ type: "client.action_result", session: this.publicSession(session), message });
      return;
    }
    if (message.type === "client.error") await this.emit({ type: "client.error", session: this.publicSession(session), message });
  }

  async startRecording(sessionId: string, input: { recordingId: string; projectId?: string | null; taskId?: string; domainId?: string }): Promise<void> {
    const session = this.requireReadySession(sessionId);
    session.activeRecordingId = input.recordingId;
    if (input.projectId !== undefined) session.projectId = input.projectId;
    await this.send(sessionId, this.serverMessage("server.start_recording", input, session));
  }

  async stopRecording(sessionId: string, recordingId?: string): Promise<void> {
    const session = this.requireReadySession(sessionId);
    const payload = recordingId ?? session.activeRecordingId ? { recordingId: recordingId ?? session.activeRecordingId ?? "" } : {};
    await this.send(sessionId, this.serverMessage("server.stop_recording", payload, session));
    session.activeRecordingId = null;
  }

  async captureSnapshot(sessionId: string, input: { kind?: string; metadata?: JsonObject } = {}): Promise<void> {
    const session = this.requireReadySession(sessionId);
    await this.send(sessionId, this.serverMessage("server.capture_snapshot", {
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
    }, session));
  }

  executeAction(sessionId: string, command: ClientGatewayActionCommand): ClientGatewayActionResponse {
    const session = this.requireReadySession(sessionId);
    const commandId = randomUUID();
    const message = this.serverMessage("server.execute_action", { ...command, commandId }, session);
    const timeoutMs = command.timeoutMs ?? this.commandTimeoutMs;
    const result = new Promise<ClientGatewayActionResult>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        resolve({ commandId, status: "timed_out", message: `Client action timed out after ${timeoutMs}ms.` });
      }, timeoutMs);
      this.pendingCommands.set(commandId, { sessionId, resolve, timeout });
    });
    void this.send(sessionId, message);
    this.audit("command.dispatched", "Action command dispatched to client.", { sessionId, commandId, actionType: command.actionType });
    return { commandId, message, result };
  }

  async sendPing(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    await this.send(sessionId, this.serverMessage("server.ping", { nonce: randomUUID() }, session));
  }

  async sendError(sessionId: string, input: { message: string; code?: string; metadata?: JsonObject }): Promise<void> {
    const session = this.requireSession(sessionId);
    await this.send(sessionId, this.serverMessage("server.error", {
      message: input.message,
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
    }, session));
    this.audit(input.code ?? "client.error", input.message, { sessionId, ...(input.metadata ?? {}) });
  }

  markActiveRecording(sessionId: string, input: { recordingId: string; projectId?: string | null }): void {
    const session = this.requireReadySession(sessionId);
    session.activeRecordingId = input.recordingId;
    if (input.projectId !== undefined) session.projectId = input.projectId;
  }

  outbound(sessionId: string): ClientGatewayServerMessage[] {
    return this.sessions.get(sessionId)?.outbound ?? [];
  }

  clearOutbound(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.outbound = [];
  }

  private async handleHello(sessionId: string, hello: ClientGatewayClientHello): Promise<void> {
    await this.ready();
    const session = this.requireSession(sessionId);
    session.clientId = hello.clientId ?? session.clientId;
    session.clientType = hello.clientType;
    session.name = hello.name ?? session.name;
    if (hello.version !== undefined) session.version = hello.version;
    session.capabilities = hello.capabilities ?? session.capabilities;
    if (hello.metadata !== undefined) session.metadata = hello.metadata;
    if (hello.token) {
      const trustedClientId = this.trustedClientByTokenHash.get(this.hashToken(hello.token));
      const trustedClient = trustedClientId ? this.trustedClients.get(trustedClientId) : undefined;
      if (trustedClient && this.isTrustedClientActive(trustedClient) && trustedClient.clientId === session.clientId) {
        const previousHash = trustedClient.tokenHash;
        const previousUpdatedAt = trustedClient.updatedAt;
        const previousLastUsedAt = trustedClient.lastUsedAt;
        const token = this.createToken();
        const now = this.now();
        trustedClient.tokenHash = this.hashToken(token);
        trustedClient.updatedAt = now;
        trustedClient.lastUsedAt = now;
        this.trustedClientByTokenHash.delete(previousHash);
        this.trustedClientByTokenHash.set(trustedClient.tokenHash, trustedClient.trustedClientId);
        try {
          await this.persistTrustedClients();
        } catch (error) {
          this.trustedClientByTokenHash.delete(trustedClient.tokenHash);
          trustedClient.tokenHash = previousHash;
          trustedClient.updatedAt = previousUpdatedAt;
          trustedClient.lastUsedAt = previousLastUsedAt;
          this.trustedClientByTokenHash.set(previousHash, trustedClient.trustedClientId);
          throw error;
        }
        for (const existing of this.sessions.values()) {
          if (existing.sessionId !== sessionId && existing.status === "ready" && existing.trustedClientId === trustedClient.trustedClientId) {
            await this.send(existing.sessionId, this.serverMessage("server.disconnect", { reason: "Client reconnected in a newer session." }, existing));
            this.disconnect(existing.sessionId, "replaced by newer session");
          }
        }
        this.attachTrustedClient(session, trustedClient);
        await this.send(sessionId, this.serverMessage("server.session_ready", { sessionId, token, ...(session.projectId !== undefined ? { projectId: session.projectId } : {}) }, session));
        this.audit("session.reconnected", "Trusted client reconnected and its credential was rotated.", { sessionId, trustedClientId: trustedClient.trustedClientId, clientId: session.clientId });
        await this.emit({ type: "session.ready", session: this.publicSession(session) });
        return;
      }
      this.audit("session.credential_rejected", "Client credential was not accepted; pairing is required.", { sessionId, clientId: session.clientId });
    }
    session.status = "pairing_required";
    const pairing = this.ensureSessionPairing(session);
    await this.send(sessionId, this.serverMessage("server.pairing_required", {
      referenceCode: pairing.referenceCode ?? pairing.pairingCode,
      reason: "Approve this client in FluxIQ before sending data."
    }, session));
  }

  private async submitPairing(sessionId: string, pairingCode: string): Promise<void> {
    const session = this.requireSession(sessionId);
    await this.send(sessionId, this.serverMessage("server.error", {
      message: "Pairing must be approved by an authenticated operator in FluxIQ.",
      code: "pairing.operator_approval_required"
    }, session));
    this.audit("pairing.client_submit_rejected", "Client-side pairing submission was rejected.", { sessionId, pairingCode });
  }

  private async completePairing(sessionId: string, pairingCode: string, approvedByUserId: string): Promise<ClientGatewaySession | null> {
    this.pruneExpiredPairings();
    const pairing = this.pairings.get(pairingCode);
    const session = this.sessions.get(sessionId);
    if (!pairing || pairing.consumedAt || !session) return null;
    const token = this.createToken();
    const now = this.now();
    const trustedClient: ClientGatewayTrustedClient = {
      trustedClientId: randomUUID(),
      clientId: session.clientId,
      clientType: session.clientType,
      name: session.name,
      tokenHash: this.hashToken(token),
      approvedByUserId,
      approvedAt: now,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      expiresAt: now + this.trustedClientTtlMs
    };
    this.trustedClients.set(trustedClient.trustedClientId, trustedClient);
    this.trustedClientByTokenHash.set(trustedClient.tokenHash, trustedClient.trustedClientId);
    try {
      await this.persistTrustedClients();
    } catch (error) {
      this.trustedClients.delete(trustedClient.trustedClientId);
      this.trustedClientByTokenHash.delete(trustedClient.tokenHash);
      throw error;
    }
    pairing.consumedAt = now;
    pairing.sessionId = sessionId;
    pairing.userId = approvedByUserId;
    delete session.pendingPairingCode;
    this.removeOtherSessionPairings(sessionId, pairingCode);
    this.attachTrustedClient(session, trustedClient);
    if (pairing.projectId !== undefined) session.projectId = pairing.projectId;
    session.pairedAt = now;
    await this.send(sessionId, this.serverMessage("server.session_ready", { sessionId, token, ...(pairing.projectId !== undefined ? { projectId: pairing.projectId } : {}) }, session));
    this.audit("session.paired", "Client session paired and durable trust created.", { sessionId, pairingCode, trustedClientId: trustedClient.trustedClientId, approvedByUserId, projectId: pairing.projectId ?? null });
    await this.emit({ type: "session.ready", session: this.publicSession(session) });
    return this.publicSession(session);
  }

  private requireReadySession(sessionId: string): InternalSession {
    const session = this.requireSession(sessionId);
    if (session.status !== "ready") throw new Error("Client session is not paired.");
    return session;
  }

  private requireSession(sessionId: string): InternalSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown client gateway session: ${sessionId}`);
    return session;
  }

  private async send(sessionId: string, message: ClientGatewayServerMessage): Promise<void> {
    const session = this.requireSession(sessionId);
    session.outbound.push(message);
    await session.socket?.send(JSON.stringify(message));
  }

  private serverMessage<TType extends ClientGatewayServerMessage["type"]>(
    type: TType,
    payload: Extract<ClientGatewayServerMessage, { type: TType }>["payload"],
    session?: ClientGatewaySession
  ): Extract<ClientGatewayServerMessage, { type: TType }> {
    return {
      id: randomUUID(),
      type,
      protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
      timestamp: this.now(),
      ...(session ? { sessionId: session.sessionId, clientId: session.clientId } : {}),
      payload
    } as Extract<ClientGatewayServerMessage, { type: TType }>;
  }

  private async emit(event: ClientGatewayEvent): Promise<void> {
    await Promise.all([...this.handlers].map((handler) => handler(event)));
  }

  private audit(type: string, message: string, metadata?: JsonObject): void {
    this.auditLog.push({
      id: randomUUID(),
      timestamp: this.now(),
      type,
      message,
      ...(metadata?.sessionId ? { sessionId: String(metadata.sessionId) } : {}),
      ...(metadata ? { metadata } : {})
    });
  }

  private publicSession(session: InternalSession): ClientGatewaySession {
    const { socket: _socket, outbound: _outbound, pendingPairingCode: _pendingPairingCode, ...publicSession } = session;
    return { ...publicSession };
  }

  private attachTrustedClient(session: InternalSession, trustedClient: ClientGatewayTrustedClient): void {
    session.status = "ready";
    session.trustedClientId = trustedClient.trustedClientId;
    session.operatorUserId = trustedClient.approvedByUserId;
    session.pairedAt ??= trustedClient.approvedAt;
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  private isTrustedClientActive(client: ClientGatewayTrustedClient): boolean {
    return !client.revokedAt && client.expiresAt > this.now();
  }

  private publicTrustedClient(client: ClientGatewayTrustedClient): ClientGatewayTrustedClientView {
    const { tokenHash: _tokenHash, ...view } = client;
    const status = client.revokedAt ? "revoked" : client.expiresAt <= this.now() ? "expired" : "active";
    return { ...view, status };
  }

  private async loadTrustedClients(): Promise<void> {
    if (!this.trustedClientStore) return;
    const clients = await this.trustedClientStore.load();
    for (const client of clients) {
      if (!client?.trustedClientId || !client.clientId || !client.tokenHash || !client.approvedByUserId) continue;
      this.trustedClients.set(client.trustedClientId, { ...client });
      if (this.isTrustedClientActive(client)) this.trustedClientByTokenHash.set(client.tokenHash, client.trustedClientId);
    }
  }

  private async persistTrustedClients(): Promise<void> {
    if (!this.trustedClientStore) return;
    await this.trustedClientStore.save([...this.trustedClients.values()].map((client) => ({ ...client })));
  }

  private createPairingCode(): string {
    let code = "";
    do {
      code = String(Math.floor(100000 + Math.random() * 900000));
    } while (this.pairings.has(code));
    return code;
  }

  private pruneExpiredPairings(): void {
    const now = this.now();
    for (const [code, pairing] of this.pairings) {
      if (pairing.expiresAt < now && !pairing.consumedAt) this.pairings.delete(code);
    }
  }

  private ensureSessionPairing(session: InternalSession): ClientGatewayPairingChallenge {
    this.pruneExpiredPairings();
    if (session.pendingPairingCode) {
      const existing = this.pairings.get(session.pendingPairingCode);
      if (existing && !existing.consumedAt && existing.expiresAt >= this.now()) return existing;
    }
    const pairing = this.createPairing({
      ...(session.projectId !== undefined ? { projectId: session.projectId } : {}),
      requestedBySessionId: session.sessionId,
      requestedByClientId: session.clientId,
      requestedByClientName: session.name
    });
    session.pendingPairingCode = pairing.pairingCode;
    return pairing;
  }

  private removeOtherSessionPairings(sessionId: string, exceptPairingCode: string): void {
    for (const [code, pairing] of this.pairings) {
      if (code !== exceptPairingCode && pairing.requestedBySessionId === sessionId && !pairing.consumedAt) this.pairings.delete(code);
    }
  }
}
