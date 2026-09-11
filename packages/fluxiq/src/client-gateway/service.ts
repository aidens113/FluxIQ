import type {
  ClientGatewayActionCommand,
  ClientGatewayActionResponse,
  ClientGatewayClientHello,
  ClientGatewayClientMessage,
  ClientGatewayEventHandler,
  ClientGatewayPairingChallenge,
  ClientGatewayServerMessage,
  ClientGatewaySession,
  ClientGatewaySocket,
  ClientGatewaySnapshotView
} from "./contracts.ts";
import type { JsonObject } from "../core/index.ts";
import {
  ClientGatewayAccess,
  ClientGatewayAuditLog,
  ClientGatewayCommands,
  ClientGatewayEventBus,
  ClientGatewayInbound,
  ClientGatewayLifecycle,
  ClientGatewayPairingFlow,
  ClientGatewayPairingRegistry,
  ClientGatewaySessionRegistry,
  ClientGatewayTransport,
  ClientGatewayTrustedClientRegistry,
  ClientGatewayViews,
  resolveClientGatewayConfig
} from "./service/index.ts";

export type {
  ClientGatewayItemKind,
  ClientGatewayServiceOptions,
  ClientGatewaySummaryItem,
  ClientGatewaySummaryPage,
  ClientGatewayTrustedClientStore
} from "./service/index.ts";

import type { ClientGatewayItemKind, ClientGatewayServiceOptions, ClientGatewaySummaryPage } from "./service/index.ts";

/**
 * The client gateway: pairing, durable client trust, session lifecycle, and the
 * command channel to a paired client.
 *
 * This class is a facade. It holds no gateway state of its own; each method
 * forwards to the collaborator under `service/` that owns the state it touches.
 * Its public surface is the gateway contract every program imports, so a method
 * is added or removed here only when that contract changes — the collaborators
 * behind it can be reshaped freely.
 */
export class ClientGatewayService {
  private readonly trustedClients: ClientGatewayTrustedClientRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly events: ClientGatewayEventBus;
  private readonly views: ClientGatewayViews;
  private readonly access: ClientGatewayAccess;
  private readonly pairingFlow: ClientGatewayPairingFlow;
  private readonly lifecycle: ClientGatewayLifecycle;
  private readonly inbound: ClientGatewayInbound;
  private readonly commands: ClientGatewayCommands;

  constructor(options: ClientGatewayServiceOptions = {}) {
    const config = resolveClientGatewayConfig(options);
    const audit = new ClientGatewayAuditLog(config.now);
    const events = new ClientGatewayEventBus();
    const sessions = new ClientGatewaySessionRegistry(config.now);
    const pairings = new ClientGatewayPairingRegistry(config);
    const trustedClients = new ClientGatewayTrustedClientRegistry(config);
    const transport = new ClientGatewayTransport(sessions, config.now);
    const pairingFlow = new ClientGatewayPairingFlow({ config, pairings, sessions, trustedClients, transport, audit, events });
    const lifecycle = new ClientGatewayLifecycle({ config, sessions, trustedClients, transport, audit, events, pairingFlow });
    const commands = new ClientGatewayCommands({ config, sessions, transport, audit });

    this.trustedClients = trustedClients;
    this.transport = transport;
    this.events = events;
    this.pairingFlow = pairingFlow;
    this.lifecycle = lifecycle;
    this.commands = commands;
    this.access = new ClientGatewayAccess({ sessions, trustedClients, transport, audit, lifecycle });
    this.inbound = new ClientGatewayInbound({ sessions, transport, events, lifecycle, pairingFlow, commands });
    this.views = new ClientGatewayViews({ config, sessions, pairings, trustedClients, audit });
  }

  async ready(): Promise<void> {
    await this.trustedClients.ready();
  }

  snapshot(): ClientGatewaySnapshotView {
    return this.views.snapshot();
  }

  summary(): { enabled: boolean; publicUrl?: string; counts: Record<ClientGatewayItemKind, number> } {
    return this.views.summary();
  }

  listSummaryItems(input: { kind: ClientGatewayItemKind; afterId?: string | null; limit?: number; search?: string }): ClientGatewaySummaryPage {
    return this.views.listSummaryItems(input);
  }

  async authorizeToken(token: string | null | undefined): Promise<ClientGatewaySession | null> {
    return this.access.authorizeToken(token);
  }

  createPairing(input: {
    projectId?: string | null;
    userId?: string;
    ttlMs?: number;
    requestedBySessionId?: string;
    requestedByClientId?: string;
    requestedByClientName?: string;
  } = {}): ClientGatewayPairingChallenge {
    return this.pairingFlow.create(input);
  }

  async approvePairing(pairingCode: string, input: { approvedByUserId: string }): Promise<ClientGatewaySession | null> {
    return this.pairingFlow.approve(pairingCode, input);
  }

  async revokeTrustedClient(trustedClientId: string, reason = "revoked by operator"): Promise<boolean> {
    return this.access.revokeTrustedClient(trustedClientId, reason);
  }

  dismissPairing(pairingCode: string): boolean {
    return this.pairingFlow.dismiss(pairingCode);
  }

  connect(input: { socket?: ClientGatewaySocket; hello?: ClientGatewayClientHello } = {}): ClientGatewaySession {
    return this.lifecycle.connect(input);
  }

  disconnect(sessionId: string, reason = "disconnected"): ClientGatewaySession | null {
    return this.lifecycle.disconnect(sessionId, reason);
  }

  onEvent(handler: ClientGatewayEventHandler): () => void {
    return this.events.subscribe(handler);
  }

  async receiveRaw(sessionId: string, rawMessage: string): Promise<void> {
    await this.inbound.receiveRaw(sessionId, rawMessage);
  }

  async receive(sessionId: string, message: ClientGatewayClientMessage): Promise<void> {
    await this.inbound.receive(sessionId, message);
  }

  async startRecording(sessionId: string, input: { recordingId: string; projectId?: string | null; taskId?: string; domainId?: string }): Promise<void> {
    await this.commands.startRecording(sessionId, input);
  }

  async stopRecording(sessionId: string, recordingId?: string): Promise<void> {
    await this.commands.stopRecording(sessionId, recordingId);
  }

  async captureSnapshot(sessionId: string, input: { kind?: string; metadata?: JsonObject } = {}): Promise<void> {
    await this.commands.captureSnapshot(sessionId, input);
  }

  executeAction(sessionId: string, command: ClientGatewayActionCommand): ClientGatewayActionResponse {
    return this.commands.executeAction(sessionId, command);
  }

  async sendPing(sessionId: string): Promise<void> {
    await this.commands.sendPing(sessionId);
  }

  async sendError(sessionId: string, input: { message: string; code?: string; metadata?: JsonObject }): Promise<void> {
    await this.commands.sendError(sessionId, input);
  }

  markActiveRecording(sessionId: string, input: { recordingId: string; projectId?: string | null }): void {
    this.commands.markActiveRecording(sessionId, input);
  }

  outbound(sessionId: string): ClientGatewayServerMessage[] {
    return this.transport.outbound(sessionId);
  }

  clearOutbound(sessionId: string): void {
    this.transport.clearOutbound(sessionId);
  }
}
