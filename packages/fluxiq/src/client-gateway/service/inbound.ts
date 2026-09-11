import type { ClientGatewayClientMessage } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayCommands } from "./commands.ts";
import type { ClientGatewayEventBus } from "./event-bus.ts";
import type { ClientGatewayLifecycle } from "./lifecycle.ts";
import type { ClientGatewayPairingFlow } from "./pairing-flow.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTransport } from "./transport.ts";

type InboundCollaborators = {
  sessions: ClientGatewaySessionRegistry;
  transport: ClientGatewayTransport;
  events: ClientGatewayEventBus;
  lifecycle: ClientGatewayLifecycle;
  pairingFlow: ClientGatewayPairingFlow;
  commands: ClientGatewayCommands;
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

  constructor(collaborators: InboundCollaborators) {
    this.sessions = collaborators.sessions;
    this.transport = collaborators.transport;
    this.events = collaborators.events;
    this.lifecycle = collaborators.lifecycle;
    this.pairingFlow = collaborators.pairingFlow;
    this.commands = collaborators.commands;
  }

  async receiveRaw(sessionId: string, rawMessage: string): Promise<void> {
    const parsed = JSON.parse(rawMessage) as ClientGatewayClientMessage;
    await this.receive(sessionId, parsed);
  }

  async receive(sessionId: string, message: ClientGatewayClientMessage): Promise<void> {
    const session = this.sessions.require(sessionId);
    this.sessions.touch(session);
    if (message.type === "client.hello") {
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
      session.activeRecordingId = null;
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
      this.commands.settle(message.payload);
      await this.events.emit({ type: "client.action_result", session: this.sessions.toPublic(session), message });
      return;
    }
    if (message.type === "client.error") await this.events.emit({ type: "client.error", session: this.sessions.toPublic(session), message });
  }
}
