import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { ClientGatewayPeer, ClientGatewayService } from "fluxiq/client-gateway";
import type { JsonObject } from "fluxiq/core";
import { isClientHelloText } from "./is-client-hello.ts";
import { NativeWebSocketConnection, type NativeWebSocketViolation } from "./native-connection.ts";
import { createSocketRateLimit } from "./rate-limit.ts";
import { rejectUpgrade } from "./reject-upgrade.ts";
import { serverEnvelope } from "./server-envelope.ts";
import type { ClientGatewayTransportLimits } from "./transport-limits.ts";

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

type TransportAudit = (type: string, message: string, metadata: JsonObject) => void;

export type AcceptClientGatewaySocketInput = {
  gateway: ClientGatewayService;
  request: IncomingMessage;
  socket: Duplex;
  head: Buffer;
  limits: ClientGatewayTransportLimits;
  peer: ClientGatewayPeer;
  /** Hears the connection end, once. */
  onClosed(connection: NativeWebSocketConnection): void;
};

/**
 * Completes the handshake and attaches the socket to the gateway as a session,
 * with the frame cap, the rate limit and the hello deadline in force. Every
 * refusal is audited through `recordTransportEvent` with the peer's prefix
 * only. Returns null when the handshake itself was refused.
 */
export function acceptClientGatewaySocket(input: AcceptClientGatewaySocketInput): NativeWebSocketConnection | null {
  const key = input.request.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    rejectUpgrade(input.socket, 400, "Missing WebSocket Key");
    return null;
  }
  const accept = createHash("sha1").update(`${key}${WEBSOCKET_GUID}`).digest("base64");
  input.socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, "", ""].join("\r\n"));

  const { gateway, limits } = input;
  let sessionId = "";
  let ended = false;
  let disconnectReason = "socket closed";
  let helloDeadline: NodeJS.Timeout | null = null;
  const audit: TransportAudit = (type, message, metadata) => {
    gateway.recordTransportEvent(type, message, { ...(sessionId ? { sessionId } : {}), clientAddressPrefix: input.peer.prefix, ...metadata });
  };
  const clearHelloDeadline = (): void => {
    if (helloDeadline !== null) clearTimeout(helloDeadline);
    helloDeadline = null;
  };
  const connection: NativeWebSocketConnection = new NativeWebSocketConnection({
    socket: input.socket,
    maxFrameBytes: limits.maxFrameBytes,
    rateLimit: createSocketRateLimit(limits),
    onText: async (message) => {
      if (helloDeadline !== null && isClientHelloText(message)) clearHelloDeadline();
      try {
        await gateway.receiveRaw(sessionId, message);
      } catch (error) {
        connection.send(serverEnvelope("server.error", { message: error instanceof Error ? error.message : "Invalid client gateway message.", code: "gateway.receive_failed" }));
      }
    },
    onViolation: (violation) => {
      disconnectReason = violationReason(violation);
      auditViolation(audit, violation, limits);
    },
    onClose: () => {
      clearHelloDeadline();
      if (ended) return;
      ended = true;
      input.onClosed(connection);
      if (sessionId) gateway.disconnect(sessionId, disconnectReason);
    }
  });
  sessionId = gateway.connect({ socket: connection, peer: input.peer }).sessionId;
  if (limits.helloDeadlineMs !== null) helloDeadline = startHelloDeadline(limits.helloDeadlineMs, () => {
    helloDeadline = null;
    if (!connection.open) return;
    disconnectReason = "hello deadline";
    audit("transport.hello_deadline", "A client sent no client.hello within the transport's hello deadline; the socket was closed with 1008.", { helloDeadlineMs: limits.helloDeadlineMs });
    connection.terminate(1008, "hello deadline");
  });
  if (input.head.length) connection.acceptData(input.head);
  return connection;
}

function startHelloDeadline(deadlineMs: number, expire: () => void): NodeJS.Timeout {
  const timer = setTimeout(expire, deadlineMs);
  timer.unref();
  return timer;
}

function violationReason(violation: NativeWebSocketViolation): string {
  return violation.kind === "frame_too_large" ? "frame too large" : "rate limit exceeded";
}

function auditViolation(audit: TransportAudit, violation: NativeWebSocketViolation, limits: ClientGatewayTransportLimits): void {
  if (violation.kind === "frame_too_large") {
    audit("transport.frame_too_large", "A client frame or message beyond the transport's size limit was refused; the socket was closed with 1009.", { declaredBytes: violation.declaredBytes, maxFrameBytes: limits.maxFrameBytes });
    return;
  }
  audit("transport.rate_limited", "A client sent messages faster than the transport's rate limit; the socket was closed with 1008.", { messagesPerSecond: limits.messagesPerSecond, messageBurst: limits.messageBurst });
}
