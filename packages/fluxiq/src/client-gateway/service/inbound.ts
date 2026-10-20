import type { ClientGatewayClientMessage, ClientGatewayEvent } from "@fluxiq/contracts/client-gateway";
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
import { ClientGatewayTraceDeliveryCollector, withoutClientGatewayTraceMetadata, type ClientGatewayTraceInboundCapture, type ClientGatewayTraceTap } from "./trace-tap/index.ts";

type InboundCollaborators = {
  sessions: ClientGatewaySessionRegistry;
  transport: ClientGatewayTransport;
  events: ClientGatewayEventBus;
  lifecycle: ClientGatewayLifecycle;
  pairingFlow: ClientGatewayPairingFlow;
  commands: ClientGatewayCommands;
  audit: ClientGatewayAuditLog;
  trace: ClientGatewayTraceTap;
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
  private readonly trace: ClientGatewayTraceTap;
  private readonly facade: ClientGatewayFacadePorts;

  constructor(collaborators: InboundCollaborators) {
    this.sessions = collaborators.sessions;
    this.transport = collaborators.transport;
    this.events = collaborators.events;
    this.lifecycle = collaborators.lifecycle;
    this.pairingFlow = collaborators.pairingFlow;
    this.commands = collaborators.commands;
    this.audit = collaborators.audit;
    this.trace = collaborators.trace;
    this.facade = collaborators.facade;
  }

  /**
   * Raw text from a client's socket. Under a trace that claims the session, or
   * the command a result answers, the text is recorded as received -- after it
   * parsed, before anything awaits -- and then what became of it
   * (`./trace-tap/`). Text that does not parse is recorded and still throws.
   */
  async receiveRaw(sessionId: string, rawMessage: string): Promise<void> {
    let parsed: ClientGatewayClientMessage;
    try {
      parsed = JSON.parse(rawMessage) as ClientGatewayClientMessage;
    } catch (error) {
      this.trace.parseFailed(sessionId, rawMessage, error);
      throw error;
    }
    await this.deliver(sessionId, parsed, this.trace.inboundText(sessionId, rawMessage, parsed));
  }

  /** A message handed over in process: recorded under a trace as its JSON text at entry, then handled as raw text is. */
  async receive(sessionId: string, message: ClientGatewayClientMessage): Promise<void> {
    await this.deliver(sessionId, message, this.trace.inboundMessage(sessionId, message));
  }

  private async deliver(sessionId: string, message: ClientGatewayClientMessage, capture: ClientGatewayTraceInboundCapture | undefined): Promise<void> {
    if (capture === undefined) {
      await this.handle(sessionId, message);
      return;
    }
    // What Core delivers for a traced message is digested where it is delivered (P3).
    const delivery = new ClientGatewayTraceDeliveryCollector();
    let disposition: string;
    try {
      disposition = await this.handle(sessionId, message, delivery);
    } catch (error) {
      // The socket host answers this failure with `gateway.receive_failed` carrying the same message.
      this.trace.disposition(capture, { disposition: "receive_failed", error: error instanceof Error ? error.message : String(error), delivered: delivery.read() });
      throw error;
    }
    this.trace.disposition(capture, { disposition, error: null, delivered: delivery.read() });
  }

  /**
   * Handles one client message and says what became of it: the disposition a
   * trace records. `delivery`, under a trace, hears what Core delivered.
   */
  private async handle(sessionId: string, received: ClientGatewayClientMessage, delivery?: ClientGatewayTraceDeliveryCollector): Promise<string> {
    // A client's trace references never reach a settle, an event or anything past them (D14).
    const message = withoutClientGatewayTraceMetadata(received);
    const session = this.sessions.require(sessionId);
    this.sessions.touch(session);
    if (message.type === "client.hello") {
      if (!await this.admitProtocolVersion(sessionId, message.protocolVersion)) return "protocol_version_refused";
      await this.lifecycle.handleHello(sessionId, message.payload);
      return "hello_handled";
    }
    if (message.type === "client.pairing_submit") {
      await this.pairingFlow.rejectClientSubmission(sessionId, message.payload.pairingCode);
      return "pairing_submit_rejected";
    }
    if (session.status !== "ready") {
      await this.transport.send(sessionId, this.transport.message("server.pairing_required", { reason: "Session must pair before sending client data." }, session));
      return "pairing_required";
    }
    if (message.type === "client.capabilities") {
      session.capabilities = message.payload.capabilities;
      return "accepted";
    }
    if (message.type === "client.state_update") {
      session.stateUpdate = message.payload;
      await this.emit(delivery, { type: "client.state_update", session: this.sessions.toPublic(session), message });
      return "accepted";
    }
    if (message.type === "client.start_recording") {
      await this.emit(delivery, { type: "client.start_recording", session: this.sessions.toPublic(session), message });
      return "accepted";
    }
    if (message.type === "client.stop_recording") {
      await this.emit(delivery, { type: "client.stop_recording", session: this.sessions.toPublic(session), message });
      // Only the recording this Stop stopped: a start acknowledged while it was handled keeps its id.
      if (session.activeRecordingId === message.payload.recordingId) session.activeRecordingId = null;
      return "accepted";
    }
    if (message.type === "client.recording_entry") {
      await this.emit(delivery, { type: "client.recording_entry", session: this.sessions.toPublic(session), message });
      return "accepted";
    }
    if (message.type === "client.recording_event") {
      await this.emit(delivery, { type: "client.recording_event", session: this.sessions.toPublic(session), message });
      return "accepted";
    }
    if (message.type === "client.snapshot") {
      await this.emit(delivery, { type: "client.snapshot", session: this.sessions.toPublic(session), message });
      return "accepted";
    }
    if (message.type === "client.action_result") {
      // A client's `interrupted` is read into Core's own status here, before
      // anything waits on it, so no caller or listener meets it.
      const reading = readClientGatewayActionResult(this.commands.isDurableCommand(message.payload?.commandId) ? structuredClone(message.payload) : message.payload);
      const eventMessage = { ...message, payload: reading.result };
      const eventSession = this.sessions.toPublic(session);
      const disposition = await this.commands.settle(sessionId, reading, delivery === undefined ? undefined : (result) => delivery.heardResult(result));
      if (disposition === "wrong_session" || disposition === "suppressed") return disposition;
      // Still published as a diagnostic, late or unknown alike: no listener of this event applies an outcome.
      await this.emit(delivery, { type: "client.action_result", session: eventSession, message: eventMessage });
      return disposition;
    }
    if (message.type === "client.reconcile_result") {
      // An answer to Core's own question about a command (C8, B3). It settles
      // only the question; an answer nobody asked for is dropped and audited.
      if (this.commands.answerReconcile(sessionId, message.payload)) return "reconcile_answered";
      this.audit.record("command.reconcile_unasked", "A reconcile answer arrived that no open question was waiting for; it was ignored.", { sessionId });
      return "reconcile_unasked";
    }
    if (message.type !== "client.error") return "ignored";
    await this.emit(delivery, { type: "client.error", session: this.sessions.toPublic(session), message });
    return "accepted";
  }

  /** Emits `event` to the gateway's listeners; under a trace, its digest is taken first. */
  private async emit(delivery: ClientGatewayTraceDeliveryCollector | undefined, event: Extract<ClientGatewayEvent, { message: unknown }>): Promise<void> {
    delivery?.heardEvent(event.type, event.message);
    await this.events.emit(event);
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
