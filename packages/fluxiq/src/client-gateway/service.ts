import { ClientGatewayTransportBuildIdentity, type TrustedTransportBuildLease } from "./service/transport-build-identity/index.ts";
import type { TrustedModuleBuildIdentity } from "../runtime/build-identity/modules/index.ts";
import type {
  ClientGatewayActionCommand,
  ClientGatewayActionResponse,
  ClientGatewayActivity,
  ClientGatewayClientHello,
  ClientGatewayClientMessage,
  ClientGatewayEventHandler,
  ClientGatewayPairingChallenge,
  ClientGatewayReconcileAnswer,
  ClientGatewayServerMessage,
  ClientGatewaySession,
  ClientGatewaySocket,
  ClientGatewaySnapshotView
} from "./contracts.ts";
import type { JsonObject } from "../core/index.ts";
import type { ClientGatewayDurableActionOptions, ClientGatewayDurableActionResponse } from "./service/command-ledger/index.ts";
import {
  ClientGatewayAccess,
  ClientGatewayActivityPublisher,
  ClientGatewayAuditLog,
  ClientGatewayCommands,
  ClientGatewayEventBus,
  ClientGatewayInbound,
  ClientGatewayLifecycle,
  ClientGatewayPairingFlow,
  ClientGatewayPairingRegistry,
  ClientGatewaySessionRegistry,
  ClientGatewayTraceTap,
  ClientGatewayTransport,
  ClientGatewayTrustedClientRegistry,
  ClientGatewayViews,
  resolveClientGatewayConfig,
  withoutClientGatewayAddresses
} from "./service/index.ts";

export type {
  ClientGatewayCommandClosure,
  ClientGatewayCommandOwnerRef,
  ClientGatewayLateActionResult,
  ClientGatewayLateActionResultListener,
  ClientGatewayItemKind,
  ClientGatewayServiceOptions,
  ClientGatewaySummaryItem,
  ClientGatewaySummaryPage,
  ClientGatewayTraceArtifactIntake,
  ClientGatewayTraceArtifactUpload,
  ClientGatewayTrustedClientStore,
  ClientGatewayPeer,
  ClientGatewayPairingLimits,
  ClientGatewayPairingCapacityScope,
  ClientGatewaySecurityEventListener
} from "./service/index.ts";
export {
  CLIENT_GATEWAY_TRACE_TAP_STREAMS,
  CLIENT_GATEWAY_SECURITY_EVENT_TYPES,
  CLIENT_GATEWAY_TRANSPORT_EVENT_TYPES,
  ClientGatewayPairingCapacityError
} from "./service/index.ts";

import type { ClientGatewayFacadePorts, ClientGatewayItemKind, ClientGatewayLateActionResultListener, ClientGatewayPairingLimits, ClientGatewayPeer, ClientGatewaySecurityEventListener, ClientGatewayServiceOptions, ClientGatewaySummaryPage, ClientGatewayTraceArtifactIntake, ClientGatewayTraceArtifactUpload } from "./service/index.ts";

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
  private readonly transportBuildIdentity = new ClientGatewayTransportBuildIdentity();
  private readonly trustedClients: ClientGatewayTrustedClientRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly events: ClientGatewayEventBus;
  private readonly views: ClientGatewayViews;
  private readonly access: ClientGatewayAccess;
  private readonly pairingFlow: ClientGatewayPairingFlow;
  private readonly lifecycle: ClientGatewayLifecycle;
  private readonly inbound: ClientGatewayInbound;
  private readonly commands: ClientGatewayCommands;
  private readonly audit: ClientGatewayAuditLog;
  private readonly activity: ClientGatewayActivityPublisher;
  private readonly trace: ClientGatewayTraceTap;
  private readonly pairings: ClientGatewayPairingRegistry;

  constructor(options: ClientGatewayServiceOptions = {}) {
    const config = resolveClientGatewayConfig(options);
    const audit = new ClientGatewayAuditLog(config.now, config.auditLimit);
    const events = new ClientGatewayEventBus();
    const sessions = new ClientGatewaySessionRegistry(config.now, config.sessionRetention);
    // The per-address pairing cap reads the requesting session's peer address, which never leaves the gateway.
    const pairings = new ClientGatewayPairingRegistry(config, (sessionId) => sessions.get(sessionId)?.peer?.address ?? null);
    const trustedClients = new ClientGatewayTrustedClientRegistry(config);
    // Routes what the gateway sends and receives into the traces of the episodes that claim it; inert without `options.trace`.
    const trace = new ClientGatewayTraceTap({ source: options.trace, clientIdOf: (sessionId) => sessions.get(sessionId)?.clientId, sessionViewOf: (sessionId) => sessions.get(sessionId) });
    const transport = new ClientGatewayTransport(sessions, config.now, trace, config.createId);
    // Collaborators call back into this service's public surface through this
    // object, never through the collaborator that owns the method, so an
    // override or a stub on a public method is still honoured.
    const facade: ClientGatewayFacadePorts = {
      ready: () => this.ready(),
      disconnect: (sessionId, reason) => this.disconnect(sessionId, reason)
    };
    const pairingFlow = new ClientGatewayPairingFlow({ config, pairings, sessions, trustedClients, transport, audit, events, trace, facade });
    const lifecycle = new ClientGatewayLifecycle({ config, sessions, trustedClients, transport, audit, events, pairingFlow, trace, facade });
    const commands = new ClientGatewayCommands({ config, sessions, transport, audit, events, resolveCommandLedger: options.resolveCommandLedger, commandOwner: options.commandOwner, hostLease: options.hostLease, channelScope: options.channelScope, trace });

    this.trustedClients = trustedClients;
    this.pairings = pairings;
    this.audit = audit;
    this.transport = transport;
    this.events = events;
    this.pairingFlow = pairingFlow;
    this.lifecycle = lifecycle;
    this.commands = commands;
    this.trace = trace;
    this.access = new ClientGatewayAccess({ sessions, trustedClients, transport, audit, lifecycle, trace, facade });
    this.inbound = new ClientGatewayInbound({ sessions, transport, events, lifecycle, pairingFlow, commands, audit, trace, facade });
    this.activity = new ClientGatewayActivityPublisher(sessions, transport);
    this.views = new ClientGatewayViews({ config, sessions, pairings, trustedClients, audit, channelScope: options.channelScope });
  }

  /** Trusted local transport binds before IO; legacy callers remain unattested. */
  bindTransportBuildIdentity(identity?: TrustedModuleBuildIdentity | null): TrustedTransportBuildLease { return this.transportBuildIdentity.bind(identity); }
  readTransportBuildIdentity(): TrustedModuleBuildIdentity | null { return this.transportBuildIdentity.read(); }

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

  /**
   * `peer` is where the transport says the connection came from. It is kept on
   * the gateway's own session record for the per-address pairing cap and is
   * never in the returned session, an event or the snapshot; the audit carries
   * its prefix only.
   */
  connect(input: { socket?: ClientGatewaySocket; hello?: ClientGatewayClientHello; peer?: ClientGatewayPeer } = {}): ClientGatewaySession {
    return this.lifecycle.connect(input);
  }

  /**
   * Replaces the caps on pairing challenges waiting for approval; the
   * transport calls it at start with its profile's limits. Challenges already
   * waiting are kept. Throws on a value that is not a positive whole number.
   */
  setPairingLimits(limits: ClientGatewayPairingLimits): void {
    this.pairings.setLimits(limits);
  }

  /**
   * Hears every security event as it is recorded (`CLIENT_GATEWAY_SECURITY_EVENT_TYPES`
   * and everything `recordTransportEvent` reports), so the web layer can
   * persist what the bounded audit ring will overwrite. Returns the unsubscribe.
   */
  onSecurityEvent(listener: ClientGatewaySecurityEventListener): () => void {
    return this.audit.onSecurityEvent(listener);
  }

  /**
   * Audits a refusal the transport made before or beside the gateway (an
   * Origin refused, a frame too large, a hello deadline missed, a rate limit;
   * `CLIENT_GATEWAY_TRANSPORT_EVENT_TYPES`), into the same ring and to the
   * security listeners. A full address in `metadata` is dropped and a `peer`
   * is kept as its prefix.
   */
  recordTransportEvent(type: string, message: string, metadata?: JsonObject): void {
    if (typeof type !== "string" || !type) throw new Error("client_gateway.transport_event_type_required");
    this.audit.recordSecurity(type, message, withoutClientGatewayAddresses(metadata));
  }

  disconnect(sessionId: string, reason = "disconnected"): ClientGatewaySession | null {
    return this.lifecycle.disconnect(sessionId, reason);
  }

  /**
   * Attaches a session under a channel scope (`service/channel-scope/`): an
   * offline trial's recorded client or a unit test's scripted one, answering
   * through `receive` like any client. It is ready without pairing, never
   * stored as a trusted client, and given a client id of its own; it is seen
   * and reached only from inside `scopeId`, and nothing outside it can send to
   * it. Disconnect it with `disconnect` when the scope ends.
   */
  attachScopedSession(input: { scopeId: string; socket: ClientGatewaySocket; hello: ClientGatewayClientHello }): ClientGatewaySession {
    return this.lifecycle.attachScoped(input);
  }

  /** Whether `sessionId` was attached under a channel scope, so what it sends is never taken in as a live observation. */
  isScopedSession(sessionId: string): boolean {
    return this.lifecycle.isScoped(sessionId);
  }

  onEvent(handler: ClientGatewayEventHandler): () => void {
    return this.events.subscribe(handler);
  }

  /**
   * Hears every action result that arrives after Core stopped waiting for its
   * command -- timed out, marked uncertain, closed or already settled -- from
   * the client the command was sent to. Such a result resolves nothing; this is
   * how it reaches the run's evidence.
   */
  onLateActionResult(listener: ClientGatewayLateActionResultListener): () => void {
    return this.commands.onLateActionResult(listener);
  }

  async receiveRaw(sessionId: string, rawMessage: string): Promise<void> {
    await this.inbound.receiveRaw(sessionId, rawMessage);
  }

  async receive(sessionId: string, message: ClientGatewayClientMessage): Promise<void> {
    await this.inbound.receive(sessionId, message);
  }

  /**
   * A trace artifact a paired client uploaded for a traced command (D13):
   * refused when its bytes do not hash to `sha256`, otherwise recorded into
   * every open trace claiming the session. Answers how many traces took it;
   * none is not a failure -- the trace that asked may have closed meanwhile.
   */
  receiveTraceArtifact(sessionId: string, upload: ClientGatewayTraceArtifactUpload): ClientGatewayTraceArtifactIntake {
    return this.trace.artifact(sessionId, upload);
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

  executeAction(sessionId: string, command: ClientGatewayActionCommand): ClientGatewayActionResponse;
  executeAction(sessionId: string, command: ClientGatewayActionCommand, options: ClientGatewayDurableActionOptions): ClientGatewayDurableActionResponse;
  executeAction(sessionId: string, command: ClientGatewayActionCommand, options?: ClientGatewayDurableActionOptions): ClientGatewayActionResponse | ClientGatewayDurableActionResponse {
    return arguments.length > 2 ? this.commands.executeAction(sessionId, command, options!) : this.commands.executeAction(sessionId, command);
  }

  /**
   * Asks the client a command was sent to what became of it -- `landed` with
   * the result it kept, `not_seen`, `running` or `unknown` -- by command id,
   * as a question it answers from what it kept and never by acting (C8, B3).
   * A command whose answer never came is asked about this way before it is
   * settled `timed_out`. `undefined` when no session of that client declared
   * it answers, or the command is not one this gateway remembers sending.
   */
  reconcileAction(commandId: string): Promise<ClientGatewayReconcileAnswer | undefined> {
    return this.commands.reconcileAction(commandId);
  }
  /** Finish pending action accounting and leased durable ports before program storage shuts down. */
  close(): Promise<void> { return this.commands.close(); }

  async sendPing(sessionId: string): Promise<void> {
    await this.commands.sendPing(sessionId);
  }

  async sendError(sessionId: string, input: { message: string; code?: string; metadata?: JsonObject }): Promise<void> {
    await this.commands.sendError(sessionId, input);
  }

  markActiveRecording(sessionId: string, input: { recordingId: string; projectId?: string | null }): void {
    this.commands.markActiveRecording(sessionId, input);
  }

  /**
   * Pushes `server.activity` to every ready session that advertised the
   * activity capability and is bound to `target.projectId` or to no project.
   * The message skips the outbound queue and is dropped on a closed socket.
   * Returns how many sessions it was sent to.
   */
  publishActivity(activity: ClientGatewayActivity, target: { projectId: string }): number {
    return this.activity.publish(activity, target);
  }

  /**
   * Records an operational gateway event for the operator without telling the
   * client anything. `sendError` is the only other way into the audit log, and
   * it also puts `server.error` on the wire, which a client is entitled to read
   * as a failed connection. Use this for something the operator has to be able
   * to see and the client can do nothing about — a message that arrived too
   * late to be kept, for instance.
   */
  recordAuditEvent(input: { type: string; message: string; sessionId?: string; metadata?: JsonObject }): void {
    this.audit.record(input.type, input.message, {
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.metadata ?? {})
    });
  }

  outbound(sessionId: string): ClientGatewayServerMessage[] {
    return this.transport.outbound(sessionId);
  }

  clearOutbound(sessionId: string): void {
    this.transport.clearOutbound(sessionId);
  }
}
