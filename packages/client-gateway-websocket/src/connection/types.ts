import type { ClientGatewayClientMessage, ClientGatewayServerMessage } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayOutbox, ClientGatewayOutboxContext, ClientGatewayOutboxLoss } from "../outbox/index.ts";
import type { FluxIQClientGatewayWebSocketOptions, FluxIQWebSocketConstructor } from "../types.ts";

/**
 * Where a reconnecting client connection stands.
 *
 * - `connecting`: a socket is opening, or is open and the gateway is checking
 *   the token the hello carried.
 * - `pairing`: the socket is open and waits for a person to approve the client.
 * - `connected`: the host marked the session ready (`markSessionReady`).
 * - `reconnecting`: the socket went away and a retry is scheduled.
 * - `error`: the last attempt failed; `reportError` said why.
 * - `disconnected`: no socket, and none wanted or scheduled.
 */
export type ClientGatewayConnectionState = "disconnected" | "connecting" | "pairing" | "connected" | "reconnecting" | "error";

/** The connection-health fields a client's status carries. */
export type ClientGatewayConnectionStatus = {
  connectionState: ClientGatewayConnectionState;
  queueSize: number;
  lastMessageAt: number | undefined;
  pairingReferenceCode: string | undefined;
};

/** Sends one client message to the gateway, or queues it while the socket is down. */
export type ClientGatewayConnectionSender = <TType extends ClientGatewayClientMessage["type"]>(
  type: TType,
  payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]
) => Promise<void>;

/** The hello a connection opens each socket with; the token, when absent, comes from `tokenStorage`. */
export type ClientGatewayConnectionHello = FluxIQClientGatewayWebSocketOptions["client"];

/** Where the gateway token is kept between sockets. The host owns its lifetime and secrecy. */
export type ClientGatewayConnectionTokenStorage = NonNullable<FluxIQClientGatewayWebSocketOptions["tokenStorage"]>;

/** What the host hears from a connection, besides its own `on` subscriptions. */
export type ClientGatewayConnectionHandlers = {
  /** Every server message, before any typed event for it. */
  onServerMessage?(message: ClientGatewayServerMessage): void;
  onPairingRequired?(referenceCode: string | undefined, reason: string): void;
  /** Called once the trust lineage for this socket is decided and stored. */
  onSessionReady?(message: Extract<ClientGatewayServerMessage, { type: "server.session_ready" }>): void;
  /** Every heartbeat tick while the connection is `connected`. */
  onHeartbeat?(): void;
  /**
   * Every heartbeat tick while the socket is open but not connected
   * (`pairing`, `connecting`). Nothing crosses the socket then, so a host
   * whose process is stopped when idle keeps itself alive here. Not a gateway
   * message: an unpaired session may not send client data.
   */
  keepAlive?(): void;
  /**
   * After a flush that reported lost queued messages to the gateway: how many
   * were lost, and why. Called only once the gateway was sent the loss marker.
   */
  onQueueLoss?(loss: ClientGatewayOutboxLoss): void;
};

export type ClientGatewayConnectionOptions = {
  url(): string;
  hello(): ClientGatewayConnectionHello;
  tokenStorage: ClientGatewayConnectionTokenStorage;
  WebSocketImpl?: FluxIQWebSocketConstructor;
  /** How long a socket is given to open (default `CLIENT_GATEWAY_OPEN_TIMEOUT_MS`). */
  openTimeoutMs?: number;
  /** Read at each drop or failed open: whether to schedule a retry. */
  autoReconnect(): boolean;
  /** First retry delay; each further retry doubles it (default 1,000 ms). */
  reconnectBaseDelayMs?: number;
  /** The longest retry delay (default 30,000 ms). */
  reconnectMaxDelayMs?: number;
  /** Heartbeat and keep-alive tick (default 20,000 ms). */
  heartbeatIntervalMs?: number;
  outbox: ClientGatewayOutbox;
  /** The project and recording the client is in now; read when a message is queued and when the queue is flushed. */
  context(): ClientGatewayOutboxContext;
  /** The client id stamped on messages queued while the socket is down. */
  clientId(): string | undefined;
  /** A new trust lineage id (default `globalThis.crypto.randomUUID()`). */
  mintLineage?(): string;
  /** Run before each socket is opened. */
  beforeConnect?(): Promise<void>;
  emitStatus(): void;
  /** A connection failure, worded for a person; the host owns where it shows. */
  reportError(message: string): void;
  clearError(): void;
  handlers: ClientGatewayConnectionHandlers;
};
