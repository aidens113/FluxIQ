import type {
  ClientGatewayActionCommand,
  ClientGatewayCapability,
  ClientGatewayEvent,
  ClientGatewayService,
  ClientGatewaySession
} from "../client-gateway/index.ts";
import type { JsonObject } from "../core/index.ts";
import type {
  FluxIQRuntimeCapability,
  FluxIQRuntimeClient,
  FluxIQRuntimeCommand,
  FluxIQRuntimeCommandResult,
  FluxIQRuntimeDispatchContext,
  FluxIQRuntimeEvent,
  FluxIQRuntimeEventHandler,
  FluxIQRuntimeTransport
} from "./contracts.ts";

export type ClientGatewayRuntimeTransportOptions = {
  gateway: ClientGatewayService;
  transportId?: string;
  label?: string;
};

export class ClientGatewayRuntimeTransport implements FluxIQRuntimeTransport {
  readonly transportId: string;
  readonly label: string;
  readonly kind = "websocket" as const;
  private readonly gateway: ClientGatewayService;
  private readonly handlers = new Set<FluxIQRuntimeEventHandler>();

  constructor(options: ClientGatewayRuntimeTransportOptions) {
    this.gateway = options.gateway;
    this.transportId = options.transportId ?? "client-gateway";
    this.label = options.label ?? "Client Gateway";
    this.gateway.onEvent((event) => {
      void this.forwardGatewayEvent(event);
    });
  }

  clients(): FluxIQRuntimeClient[] {
    return this.gateway.snapshot().sessions.map((session) => runtimeClientFromGatewaySession(session));
  }

  async dispatch(command: FluxIQRuntimeCommand, context: FluxIQRuntimeDispatchContext = {}): Promise<FluxIQRuntimeCommandResult> {
    const session = this.selectSession(command, context);
    if (!session) {
      return rejected(command, "No paired client gateway session matches the requested runtime command.");
    }
    if (command.kind === "execute_action") {
      const response = this.gateway.executeAction(session.sessionId, actionCommandFromRuntime(command));
      return await response.result;
    }
    if (command.kind === "capture_snapshot") {
      await this.gateway.captureSnapshot(session.sessionId, {
        ...(command.metadata?.kind && typeof command.metadata.kind === "string" ? { kind: command.metadata.kind } : {}),
        ...(command.metadata ? { metadata: command.metadata } : {})
      });
      return {
        commandId: command.commandId ?? `gateway.snapshot.${Date.now()}`,
        status: "succeeded",
        message: "Snapshot command dispatched to client gateway session."
      };
    }
    return rejected(command, `Client gateway transport cannot dispatch runtime command kind: ${command.kind}.`);
  }

  onEvent(handler: FluxIQRuntimeEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private selectSession(command: FluxIQRuntimeCommand, context: FluxIQRuntimeDispatchContext): ClientGatewaySession | undefined {
    const ready = this.gateway.snapshot().sessions.filter((session) => session.status === "ready");
    const preferred = context.preferredSessionId
      ? ready.find((session) => session.sessionId === context.preferredSessionId)
      : context.preferredClientId
        ? ready.find((session) => session.clientId === context.preferredClientId)
        : undefined;
    if (preferred && sessionMatchesCommand(preferred, command)) return preferred;
    return ready.find((session) => sessionMatchesCommand(session, command));
  }

  private async forwardGatewayEvent(event: ClientGatewayEvent): Promise<void> {
    const client = runtimeClientFromGatewaySession(event.session);
    if (event.type === "session.ready") await this.emit({ type: "client.ready", client });
    else if (event.type === "session.disconnected") await this.emit({ type: "client.disconnected", client });
    else if (event.type === "client.state_update") await this.emit({ type: "state.update", client, payload: event.message.payload as unknown as JsonObject });
    else if (event.type === "client.snapshot") await this.emit({ type: "snapshot", client, payload: event.message.payload as unknown as JsonObject });
    else if (event.type === "client.recording_event") await this.emit({ type: "recording.event", client, payload: event.message.payload as unknown as JsonObject });
    else if (event.type === "client.action_result") {
      await this.emit({
        type: "command.result",
        result: {
          commandId: event.message.payload.commandId,
          status: event.message.payload.status,
          ...(event.message.payload.message ? { message: event.message.payload.message } : {}),
          ...(event.message.payload.payload ? { payload: event.message.payload.payload } : {}),
          ...(event.message.payload.error ? { error: event.message.payload.error } : {})
        }
      });
    } else if (event.type === "client.error") {
      await this.emit({
        type: "runtime.error",
        message: event.message.payload.message,
        metadata: {
          clientId: event.session.clientId,
          ...(event.message.payload.code ? { code: event.message.payload.code } : {}),
          ...(event.message.payload.metadata ?? {})
        }
      });
    }
  }

  private async emit(event: FluxIQRuntimeEvent): Promise<void> {
    await Promise.all([...this.handlers].map((handler) => handler(event)));
  }
}

export function runtimeClientFromGatewaySession(session: ClientGatewaySession): FluxIQRuntimeClient {
  const client: FluxIQRuntimeClient = {
    clientId: session.clientId,
    sessionId: session.sessionId,
    label: session.name,
    transport: "websocket",
    status: runtimeStatusFromGatewaySession(session.status),
    capabilities: session.capabilities.map(runtimeCapabilityFromGatewayCapability),
    connectedAt: session.connectedAt,
    lastSeenAt: session.lastSeenAt
  };
  const domainId = domainIdFromMetadata(session.metadata);
  if (domainId !== undefined) client.domainId = domainId;
  if (session.metadata !== undefined) client.metadata = session.metadata;
  return client;
}

function runtimeCapabilityFromGatewayCapability(capability: ClientGatewayCapability): FluxIQRuntimeCapability {
  const runtimeCapability: FluxIQRuntimeCapability = {
    id: capability.id,
    kind: capability.kind,
  };
  if (capability.label !== undefined) runtimeCapability.label = capability.label;
  if (capability.actionTypes !== undefined) runtimeCapability.actionTypes = capability.actionTypes;
  if (capability.metadata !== undefined) {
    runtimeCapability.metadata = capability.metadata;
    const domainId = domainIdFromMetadata(capability.metadata);
    if (domainId !== undefined) runtimeCapability.domainId = domainId;
  }
  return runtimeCapability;
}

function runtimeStatusFromGatewaySession(status: ClientGatewaySession["status"]): FluxIQRuntimeClient["status"] {
  if (status === "ready") return "ready";
  if (status === "pairing_required") return "pairing_required";
  if (status === "disconnected") return "offline";
  return "available";
}

function actionCommandFromRuntime(command: FluxIQRuntimeCommand): ClientGatewayActionCommand {
  return {
    actionType: command.actionType ?? command.outputId ?? command.capabilityId ?? command.kind,
    ...(command.parameters ? { parameters: command.parameters } : {}),
    ...(command.target ? { target: command.target } : {}),
    ...(command.timeoutMs !== undefined ? { timeoutMs: command.timeoutMs } : {}),
    ...(command.metadata ? { metadata: command.metadata } : {})
  };
}

function sessionMatchesCommand(session: ClientGatewaySession, command: FluxIQRuntimeCommand): boolean {
  if (command.domainId !== undefined) {
    const sessionDomainId = domainIdFromMetadata(session.metadata);
    if (sessionDomainId !== command.domainId) return false;
  }
  if (command.capabilityId && !session.capabilities.some((capability) => capability.id === command.capabilityId)) return false;
  if (command.actionType && !session.capabilities.some((capability) => capability.actionTypes?.includes(command.actionType!))) return false;
  return true;
}

function domainIdFromMetadata(metadata: JsonObject | undefined): string | null | undefined {
  const domainId = metadata?.domainId;
  return typeof domainId === "string" || domainId === null ? domainId : undefined;
}

function rejected(command: FluxIQRuntimeCommand, message: string): FluxIQRuntimeCommandResult {
  return {
    commandId: command.commandId ?? `rejected.${Date.now()}`,
    status: "rejected",
    message,
    error: message
  };
}
