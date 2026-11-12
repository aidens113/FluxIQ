import type {
  ClientGatewayActionResult,
  ClientGatewayClientHello,
  ClientGatewayServerMessage
} from "@fluxiq/contracts/client-gateway";

export type FluxIQWebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener?(type: "open" | "message" | "close" | "error", listener: (event: unknown) => void): void;
  removeEventListener?(type: "open" | "message" | "close" | "error", listener: (event: unknown) => void): void;
  onopen?: ((event: unknown) => void) | null;
  onmessage?: ((event: { data: unknown }) => void) | null;
  onclose?: ((event: unknown) => void) | null;
  onerror?: ((event: unknown) => void) | null;
};

export type FluxIQWebSocketConstructor = new (url: string) => FluxIQWebSocketLike;

/**
 * Where a managed host's one-time enrolment ticket comes from. `take` answers
 * the ticket it holds and forgets it, so it is asked at most once for each
 * hello, and only for a hello that carries no token: a reconnect never resends
 * a ticket, and a client with a credential never spends one.
 */
export type FluxIQClientGatewayEnrolmentSource = {
  take(): string | undefined;
};

export type FluxIQClientGatewayWebSocketOptions = {
  url?: string;
  /** The hello's fields. A ticket never travels here: it comes from `enrolment`, read only when the hello carries no token. */
  client: Omit<ClientGatewayClientHello, "token" | "enrolmentTicket"> & { token?: string };
  enrolment?: FluxIQClientGatewayEnrolmentSource;
  WebSocketImpl?: FluxIQWebSocketConstructor;
  /** How long `connect()` waits for the socket to open (default `CLIENT_GATEWAY_OPEN_TIMEOUT_MS`). */
  openTimeoutMs?: number;
  tokenStorage?: {
    read(): string | undefined | Promise<string | undefined>;
    write(token: string): void | Promise<void>;
    clear?(): void | Promise<void>;
  };
  idFactory?: () => string;
  now?: () => number;
};

export type FluxIQClientGatewayWebSocketEvent =
  | { type: "open" }
  | { type: "close"; event: unknown }
  | { type: "error"; event: unknown }
  | { type: "message"; message: ClientGatewayServerMessage }
  | { type: "pairing_required"; message: Extract<ClientGatewayServerMessage, { type: "server.pairing_required" }> }
  | { type: "session_ready"; message: Extract<ClientGatewayServerMessage, { type: "server.session_ready" }> }
  | { type: "start_recording"; message: Extract<ClientGatewayServerMessage, { type: "server.start_recording" }> }
  | { type: "stop_recording"; message: Extract<ClientGatewayServerMessage, { type: "server.stop_recording" }> }
  | { type: "capture_snapshot"; message: Extract<ClientGatewayServerMessage, { type: "server.capture_snapshot" }> }
  | { type: "execute_action"; message: Extract<ClientGatewayServerMessage, { type: "server.execute_action" }> }
  | { type: "activity"; message: Extract<ClientGatewayServerMessage, { type: "server.activity" }> };

export type FluxIQClientGatewayWebSocketEventType = FluxIQClientGatewayWebSocketEvent["type"];
export type FluxIQClientGatewayWebSocketHandler<TType extends FluxIQClientGatewayWebSocketEventType = FluxIQClientGatewayWebSocketEventType> = (
  event: Extract<FluxIQClientGatewayWebSocketEvent, { type: TType }>
) => void | Promise<void>;

export type ClientActionHandler = (
  message: Extract<ClientGatewayServerMessage, { type: "server.execute_action" }>
) => ClientGatewayActionResult | Promise<ClientGatewayActionResult>;
