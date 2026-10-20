// Test support for the trace-fed fixture (traces and offline trials, P1/P3;
// lane T U8). It wraps a client's side of the gateway so a trace recorder
// writes down what crosses the channel: every message Core sends the client, as
// a structured JSON event (kind `outbound`), and every answer the client sends
// Core, as the exact raw text it sends (kind `inbound`), each correlated to its
// command id. The answer then enters Core through `receiveRaw`, the real
// decoder, as the same text the trace holds.
//
// This wrapper stands in for P2's capture inside the gateway: once the gateway
// records through its own trace sink, a test needs no wrapper at all. Nothing
// here is specific to one domain.
import type { ClientGatewayClientMessage, ClientGatewayService, ClientGatewaySocket, ClientGatewayTraceSink } from "../../../../../client-gateway/index.ts";

const STREAM = "gateway";

/**
 * The gateway as the wrapped client sees it: `attachScopedSession` records each
 * message sent on the session's socket before the client gets it, and
 * `receive` records the client's answer as text and hands that text to
 * `receiveRaw`. Every other member is the gateway's own.
 */
export function recordingGateway(gateway: ClientGatewayService, sink: ClientGatewayTraceSink): ClientGatewayService {
  const attachScopedSession: ClientGatewayService["attachScopedSession"] = (input) => {
    const socket: ClientGatewaySocket = {
      send: (raw) => {
        recordOutbound(sink, raw);
        return input.socket.send(raw);
      }
    };
    return gateway.attachScopedSession({ ...input, socket });
  };
  const receive: ClientGatewayService["receive"] = async (sessionId, message) => {
    const text = JSON.stringify(message);
    recordInbound(sink, message, text);
    await gateway.receiveRaw(sessionId, text);
  };
  return new Proxy(gateway, {
    get(target, property, receiver) {
      if (property === "attachScopedSession") return attachScopedSession;
      if (property === "receive") return receive;
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function recordOutbound(sink: ClientGatewayTraceSink, raw: string): void {
  const message: unknown = JSON.parse(raw);
  const messageType = stringField(message, "type");
  const payload = objectField(message, "payload");
  sink.record({
    stream: STREAM,
    kind: "outbound",
    messageType,
    source: { id: stringField(message, "id"), sequence: null, timestamp: null },
    correlation: correlation(stringField(payload, "commandId")),
    payloadSchema: { name: "client-gateway.server-message", version: "1" },
    payload: { encoding: "json", value: message },
    artifactIds: [],
    redactions: []
  });
}

function recordInbound(sink: ClientGatewayTraceSink, message: ClientGatewayClientMessage, text: string): void {
  const commandId = message.type === "client.action_result" ? message.payload.commandId : null;
  sink.record({
    stream: STREAM,
    kind: "inbound",
    messageType: message.type,
    source: { id: message.id, sequence: null, timestamp: null },
    correlation: correlation(commandId),
    payloadSchema: { name: "client-gateway.client-message", version: "1" },
    payload: { encoding: "text", text },
    artifactIds: [],
    redactions: []
  });
}

function correlation(commandId: string | null) {
  return { commandId, recordingId: null, causationEventId: null, owner: null, observationRevision: null, baseRevision: null };
}

function objectField(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return Reflect.get(value, key);
}

function stringField(value: unknown, key: string): string | null {
  const field = objectField(value, key);
  return typeof field === "string" ? field : null;
}
