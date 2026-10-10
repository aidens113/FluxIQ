import type { ClientGatewayClientMessage } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "./audit-log.ts";
import type { ClientGatewayCommands } from "./commands.ts";
import type { ClientGatewayEventBus } from "./event-bus.ts";
import type { ClientGatewayFacadePorts } from "./facade-ports.ts";
import type { ClientGatewayLifecycle } from "./lifecycle.ts";
import type { ClientGatewayPairingFlow } from "./pairing-flow.ts";
import { clientGatewayProtocolVersionVerdict } from "./protocol-version.ts";
import { readClientGatewayActionResult } from "./action-result-reading.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTransport } from "./transport.ts";

type InboundCollaborators = {
  sessions: ClientGatewaySessionRegistry;
  transport: ClientGatewayTransport;
  events: ClientGatewayEventBus;
  lifecycle: ClientGatewayLifecycle;
  pairingFlow: ClientGatewayPairingFlow;
  commands: ClientGatewayCommands;
  audit: ClientGatewayAuditLog;
  // Disconnecting a refused session is a public service method, so it goes through the facade (./facade-ports.ts).
  facade: ClientGatewayFacadePorts;
};

/**
 * The one entry point for messages arriving from a client. Handshake and
 * pairing messages are answered before the session is ready; everything else is
 * refused until it is, then republished as a gateway event.
 */
export class ClientGatewayInbound {
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly events: ClientGatewayEventBus;
  private readonly lifecycle: ClientGatewayLifecycle;
  private readonly pairingFlow: ClientGatewayPairingFlow;
  private readonly commands: ClientGatewayCommands;
  private readonly audit: ClientGatewayAuditLog;
  private readonly facade: ClientGatewayFacadePorts;

  constructor(collaborators: InboundCollaborators) {
    this.sessions = collaborators.sessions;
    this.transport = collaborators.transport;
    this.events = collaborators.events;
    this.lifecycle = collaborators.lifecycle;
    this.pairingFlow = collaborators.pairingFlow;
    this.commands = collaborators.commands;
    this.audit = collaborators.audit;
    this.facade = collaborators.facade;
  }

  async receiveRaw(sessionId: string, rawMessage: string): Promise<void> {
    const parsed = JSON.parse(rawMessage) as ClientGatewayClientMessage;
    await this.receive(sessionId, parsed);
  }

  async receive(sessionId: string, message: ClientGatewayClientMessage): Promise<void> {
    const session = this.sessions.require(sessionId);
    this.sessions.touch(session);
    if (message.type === "client.hello") {
      if (!await this.admitProtocolVersion(sessionId, message.protocolVersion)) return;
      await this.lifecycle.handleHello(sessionId, message.payload);
      return;
    }
    if (message.type === "client.pairing_submit") {
      await this.pairingFlow.rejectClientSubmission(sessionId, message.payload.pairingCode);
      return;
    }
    if (session.status !== "ready") {
      await this.transport.send(sessionId, this.transport.message("server.pairing_required", { reason: "Session must pair before sending client data." }, session));
      return;
    }
    if (message.type === "client.capabilities") {
      session.capabilities = message.payload.capabilities;
      return;
    }
    if (message.type === "client.state_update") {
      session.stateUpdate = message.payload;
      await this.events.emit({ type: "client.state_update", session: this.sessions.toPublic(session), message });
      return;
    }
    if (message.type === "client.start_recording") {
      await this.events.emit({ type: "client.start_recording", session: this.sessions.toPublic(session), message });
      return;
    }
    if (message.type === "client.stop_recording") {
      await this.events.emit({ type: "client.stop_recording", session: this.sessions.toPublic(session), message });
      // Only the recording this Stop stopped: a start acknowledged while it was handled keeps its id.
      if (session.activeRecordingId === message.payload.recordingId) session.activeRecordingId = null;
      return;
    }
    if (message.type === "client.recording_entry") {
      await this.events.emit({ type: "client.recording_entry", session: this.sessions.toPublic(session), message });
      return;
    }
    if (message.type === "client.recording_event") {
      await this.events.emit({ type: "client.recording_event", session: this.sessions.toPublic(session), message });
      return;
    }
    if (message.type === "client.snapshot") {
      await this.events.emit({ type: "client.snapshot", session: this.sessions.toPublic(session), message });
      return;
    }
    if (message.type === "client.action_result") {
      // A client's `interrupted` is read into Core's own status here, before
      // anything waits on it, so no caller or listener meets it.
      const reading = readClientGatewayActionResult(this.commands.isDurableCommand(message.payload?.commandId) ? structuredClone(message.payload) : message.payload);
      const eventMessage = { ...message, payload: reading.result };
      const eventSession = this.sessions.toPublic(session);
      const disposition = await this.commands.settle(sessionId, reading);
      if (disposition === "wrong_session" || disposition === "suppressed") return;
      // Still published as a diagnostic, late or unknown alike: no listener of this event applies an outcome.
      await this.events.emit({ type: "client.action_result", session: eventSession, message: eventMessage });
      return;
    }
    if (message.type === "client.error") await this.events.emit({ type: "client.error", session: this.sessions.toPublic(session), message });
  }

  /**
   * A hello under another major protocol version is refused before it can
   * pair: the client is told why and the session is closed. A hello with no
   * version is let through with a recorded warning, because a client built
   * before the version was checked may send none (C10).
   */
  private async admitProtocolVersion(sessionId: string, protocolVersion: unknown): Promise<boolean> {
    const session = this.sessions.require(sessionId);
    const verdict = clientGatewayProtocolVersionVerdict(protocolVersion);
    if (verdict.kind === "accepted") return true;
    if (verdict.kind === "missing") {
      this.audit.record("session.protocol_version_missing", "Client hello carried no protocol version; accepted as compatible.", { sessionId, clientId: session.clientId });
      return true;
    }
    this.audit.record("session.protocol_version_refused", verdict.reason, { sessionId, clientId: session.clientId, protocolVersion: verdict.version });
    await this.transport.send(sessionId, this.transport.message("server.error", { code: "protocol_version_mismatch", message: verdict.reason }, session));
    await this.transport.send(sessionId, this.transport.message("server.disconnect", { reason: verdict.reason }, session));
    this.facade.disconnect(sessionId, "protocol version mismatch");
    return false;
  }
}
