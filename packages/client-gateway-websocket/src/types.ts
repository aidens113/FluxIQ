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

export type FluxIQClientGatewayWebSocketOptions = {
  url?: string;
  client: Omit<ClientGatewayClientHello, "token"> & { token?: string };
  WebSocketImpl?: FluxIQWebSocketConstructor;
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
  | { type: "execute_action"; message: Extract<ClientGatewayServerMessage, { type: "server.execute_action" }> };

export type FluxIQClientGatewayWebSocketEventType = FluxIQClientGatewayWebSocketEvent["type"];
export type FluxIQClientGatewayWebSocketHandler<TType extends FluxIQClientGatewayWebSocketEventType = FluxIQClientGatewayWebSocketEventType> = (
  event: Extract<FluxIQClientGatewayWebSocketEvent, { type: TType }>
) => void | Promise<void>;

export type ClientActionHandler = (
  message: Extract<ClientGatewayServerMessage, { type: "server.execute_action" }>
) => ClientGatewayActionResult | Promise<ClientGatewayActionResult>;
