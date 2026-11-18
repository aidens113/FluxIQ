import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { ClientGatewayPeer, ClientGatewayService } from "../../client-gateway/index.ts";
import { NativeWebSocketConnection } from "./native-connection.ts";
import { createSocketRateLimit } from "./rate-limit.ts";
import { rejectUpgrade } from "./reject-upgrade.ts";
import { ClientGatewaySocketSession, ClientGatewayTransportIdentityLeases, type ClientGatewayResolver } from "./routing/index.ts";
import type { ClientGatewayTransportLimits } from "./transport-limits.ts";

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export type AcceptClientGatewaySocketInput = {
  gateway: ClientGatewayService;
  resolveGateway?: ClientGatewayResolver | undefined;
  identities?: ClientGatewayTransportIdentityLeases;
  request: IncomingMessage;
  socket: Duplex;
  head: Buffer;
  limits: ClientGatewayTransportLimits;
  peer: ClientGatewayPeer;
  /** Hears the connection end, once. */
  onClosed(connection: NativeWebSocketConnection): void;
  /** Listener-owned asynchronous tenant cleanup; its rejection is already sanitized. */
  onRelease?(pending: Promise<void>): void;
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

  const { limits } = input;
  const session = new ClientGatewaySocketSession({
    gateway: input.gateway,
    resolveGateway: input.resolveGateway,
    identities: input.identities ?? new ClientGatewayTransportIdentityLeases(undefined),
    limits,
    peer: input.peer,
    origin: input.request.headers.origin ?? null,
    onRelease: input.onRelease ?? ((pending) => {
      void pending.catch(() => console.warn("[FluxIQ] Client gateway route cleanup failed."));
    })
  });
  const connection: NativeWebSocketConnection = new NativeWebSocketConnection({
    socket: input.socket,
    maxFrameBytes: limits.maxFrameBytes,
    rateLimit: createSocketRateLimit(limits),
    onText: (message) => session.enqueue(message),
    onViolation: (violation) => session.violation(violation),
    onClose: () => {
      try {
        session.end();
      } finally {
        input.onClosed(connection);
      }
    }
  });
  session.start(connection);
  if (input.head.length) connection.acceptData(input.head);
  return connection;
}
