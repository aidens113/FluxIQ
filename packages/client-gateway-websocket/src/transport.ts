import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  type ClientGatewayActionResult,
  type ClientGatewayClientMessage,
  type ClientGatewayRecordingEvent,
  type ClientGatewaySnapshot,
  type ClientGatewayStateUpdate
} from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "@fluxiq/contracts/core";
import type { ClientGatewayCredentialWriteMetadata } from "./credential-write-metadata.ts";
import { FluxIQClientGatewayCredentialPersistenceError } from "./credential-persistence-error.ts";
import { parseServerMessage } from "./messages.ts";
import { FluxIQClientGatewayOpenError } from "./open-error.ts";
import type {
  FluxIQClientGatewayWebSocketEvent,
  FluxIQClientGatewayWebSocketEventType,
  FluxIQClientGatewayWebSocketHandler,
  FluxIQClientGatewayWebSocketOptions,
  FluxIQWebSocketConstructor,
  FluxIQWebSocketLike
} from "./types.ts";

/**
 * How long `connect()` waits for its socket to open, unless
 * `openTimeoutMs` says otherwise. The gateway is local or near: a socket that
 * has not opened in this time is not going to, and the caller -- a person's
 * Connect, a reconnect, a test harness -- is owed a named failure instead of a
 * promise that never settles.
 */
export const CLIENT_GATEWAY_OPEN_TIMEOUT_MS = 10_000;

/**
 * How `send` builds the envelope. A message delivered from the offline queue
 * keeps the `id` and `timestamp` it was queued with, and its `correlationId`
 * (decision D16); its `sessionId` is always the current socket's, because the
 * gateway mints one per socket. A fresh send passes none and gets new ones.
 */
type FluxIQClientGatewaySendOptions = { id?: string; timestamp?: number; correlationId?: string };

export class FluxIQClientGatewayWebSocketClient {
  private readonly options: FluxIQClientGatewayWebSocketOptions;
  private readonly handlers = new Map<FluxIQClientGatewayWebSocketEventType, Set<FluxIQClientGatewayWebSocketHandler>>();
  private socket: FluxIQWebSocketLike | null = null;
  private sessionId: string | undefined;
  private token: string | undefined;
  private incomingMessages: Promise<void> = Promise.resolve();

  constructor(options: FluxIQClientGatewayWebSocketOptions) {
    const openTimeoutMs = options.openTimeoutMs;
    if (openTimeoutMs !== undefined && !(Number.isFinite(openTimeoutMs) && openTimeoutMs > 0)) {
      throw new Error("openTimeoutMs must be a positive finite number of milliseconds.");
    }
    this.options = options;
  }

  get connected(): boolean {
    return Boolean(this.socket && this.socket.readyState === 1);
  }

  get currentSessionId(): string | undefined {
    return this.sessionId;
  }

  async connect(): Promise<void> {
    if (this.socket && this.socket.readyState <= 1) return;
    const WebSocketImpl = this.options.WebSocketImpl ?? globalThis.WebSocket as unknown as FluxIQWebSocketConstructor | undefined;
    if (!WebSocketImpl) throw new Error("A WebSocket implementation is required.");
    const socket = new WebSocketImpl(this.options.url ?? "ws://127.0.0.1:4777/client");
    this.socket = socket;
    this.sessionId = undefined;
    try {
      await waitForOpen(socket, this.options.openTimeoutMs ?? CLIENT_GATEWAY_OPEN_TIMEOUT_MS);
    } catch (error) {
      // A socket that never opened is not this client's socket any more: a
      // later connect() must open a new one rather than return early on it.
      if (this.socket === socket) this.socket = null;
      throw error;
    }
    if (this.socket !== socket) return;
    this.attachSocketHandlers(socket);
    this.emit({ type: "open" });
    await this.incomingMessages;
    if (this.socket !== socket) return;
    let storedToken: string | undefined;
    try {
      storedToken = await this.options.tokenStorage?.read();
    } catch {
      this.failCredentialPersistence(socket, "read");
      return;
    }
    if (this.socket !== socket) return;
    this.token = this.options.client.token ?? storedToken;
    // A client with a credential resumes with it; only one without spends its enrolment ticket, once.
    const enrolmentTicket = this.token ? undefined : this.options.enrolment?.take();
    await this.send("client.hello", {
      ...this.options.client,
      ...(this.token ? { token: this.token } : {}),
      ...(enrolmentTicket ? { enrolmentTicket } : {})
    });
  }

  async close(code?: number, reason?: string): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.sessionId = undefined;
    if (!socket) return;
    try {
      socket.close(code, reason);
    } finally {
      // Publish one deliberate close now; a later native event belongs to the
      // retired socket and must not describe a replacement connection.
      this.emit({ type: "close", event: { code: code ?? 1000, reason: reason ?? "" } });
    }
  }

  on<TType extends FluxIQClientGatewayWebSocketEventType>(
    type: TType,
    handler: FluxIQClientGatewayWebSocketHandler<TType>
  ): () => void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler as unknown as FluxIQClientGatewayWebSocketHandler);
    this.handlers.set(type, set);
    return () => set.delete(handler as unknown as FluxIQClientGatewayWebSocketHandler);
  }

  async send<TType extends ClientGatewayClientMessage["type"]>(
    type: TType,
    payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"],
    options: FluxIQClientGatewaySendOptions = {}
  ): Promise<Extract<ClientGatewayClientMessage, { type: TType }>> {
    const message = {
      id: options.id ?? this.options.idFactory?.() ?? `client-message.${Math.random().toString(36).slice(2)}`,
      type,
      protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
      timestamp: options.timestamp ?? this.options.now?.() ?? Date.now(),
      ...(this.sessionId !== undefined ? { sessionId: this.sessionId } : {}),
      ...(this.options.client.clientId !== undefined ? { clientId: this.options.client.clientId } : {}),
      ...(options.correlationId !== undefined ? { correlationId: options.correlationId } : {}),
      payload
    } as Extract<ClientGatewayClientMessage, { type: TType }>;
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) throw new Error("FluxIQ client gateway WebSocket is not connected.");
    socket.send(JSON.stringify(message));
    return message;
  }

  async sendStateUpdate(state: ClientGatewayStateUpdate) {
    return await this.send("client.state_update", state);
  }

  async sendRecordingEvent(event: ClientGatewayRecordingEvent) {
    return await this.send("client.recording_event", event);
  }

  async sendSnapshot(snapshot: ClientGatewaySnapshot) {
    return await this.send("client.snapshot", snapshot);
  }

  async sendActionResult(result: ClientGatewayActionResult) {
    return await this.send("client.action_result", result);
  }

  async sendError(message: string, input: { code?: string; metadata?: JsonObject } = {}) {
    return await this.send("client.error", {
      message,
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
    });
  }

  private attachSocketHandlers(socket: FluxIQWebSocketLike): void {
    addListener(socket, "message", (event) => {
      if (this.socket !== socket) return;
      const data = typeof event === "object" && event && "data" in event ? (event as { data: unknown }).data : event;
      const message = parseServerMessage(data);
      if (!message) return;
      // The ready frame is a persistence barrier for every later frame, not
      // just other rotations. Commands and activity cannot outrun its commit.
      const handled = this.incomingMessages.then(async () => {
        if (this.socket === socket) await this.handleServerMessage(socket, message);
      });
      this.incomingMessages = handled.then(() => undefined, () => {
        if (this.socket === socket) this.emit({ type: "error", event: new Error("FluxIQ could not process a server message.") });
      });
    });
    addListener(socket, "close", (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.sessionId = undefined;
      this.emit({ type: "close", event });
    });
    addListener(socket, "error", (event) => {
      if (this.socket === socket) this.emit({ type: "error", event });
    });
  }

  private async handleServerMessage(socket: FluxIQWebSocketLike, message: import("@fluxiq/contracts/client-gateway").ClientGatewayServerMessage): Promise<void> {
    if (message.type === "server.session_ready") {
      await this.commitSession(socket, message);
      return;
    }
    if (message.sessionId) this.sessionId = message.sessionId;
    this.emit({ type: "message", message });
    if (message.type === "server.pairing_required") this.emit({ type: "pairing_required", message });
    else if (message.type === "server.start_recording") this.emit({ type: "start_recording", message });
    else if (message.type === "server.stop_recording") this.emit({ type: "stop_recording", message });
    else if (message.type === "server.capture_snapshot") this.emit({ type: "capture_snapshot", message });
    else if (message.type === "server.execute_action") this.emit({ type: "execute_action", message });
    else if (message.type === "server.activity") this.emit({ type: "activity", message });
  }

  private async commitSession(socket: FluxIQWebSocketLike, message: Extract<import("@fluxiq/contracts/client-gateway").ClientGatewayServerMessage, { type: "server.session_ready" }>): Promise<void> {
    if (this.socket !== socket) return;
    try {
      const { token, ...ready } = message.payload;
      const metadata: ClientGatewayCredentialWriteMetadata = { ...structuredClone(ready), messageId: message.id };
      await this.options.tokenStorage?.write(token, metadata);
    } catch {
      this.failCredentialPersistence(socket, "write");
      return;
    }
    if (this.socket !== socket) return;
    this.sessionId = message.payload.sessionId;
    this.token = message.payload.token;
    // Core may retire the previous credential only after storage commits. If
    // acknowledgement is lost, its next use still proves receipt, as before.
    if (message.payload.token) {
      try {
        await this.send("client.credential_received", {});
      } catch {
        console.warn("FluxIQ could not tell Core it stored its new credential; its next use will.");
      }
    }
    if (this.socket !== socket) return;
    this.emit({ type: "message", message });
    if (this.socket === socket) this.emit({ type: "session_ready", message });
  }

  private failCredentialPersistence(socket: FluxIQWebSocketLike, operation: "read" | "write"): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.sessionId = undefined;
    this.token = undefined;
    // The rejection may contain a credential or host state. Never retain it in
    // an error, close reason, log, or event published to the host.
    try {
      socket.close(1011, "Credential storage failed.");
    } catch {
      // best-effort: closing a failed socket cannot suppress the explicit terminal
      // error/close events, which retire this socket regardless.
    }
    this.emit({ type: "error", event: new FluxIQClientGatewayCredentialPersistenceError(operation) });
    this.emit({ type: "close", event: { code: 1011, reason: "Credential storage failed.", wasClean: false } });
  }

  private emit(event: FluxIQClientGatewayWebSocketEvent): void {
    for (const handler of this.handlers.get(event.type) ?? []) void handler(event as never);
  }
}

// Settles on the first of: open, an error, a close, or the deadline. Every
// outcome but open is a named `FluxIQClientGatewayOpenError`, and the deadline
// also closes the socket so it cannot open later behind the caller's back.
function waitForOpen(socket: FluxIQWebSocketLike, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (event: unknown) => {
      cleanup();
      reject(new FluxIQClientGatewayOpenError("open_failed", { cause: event }));
    };
    const onClose = (event: unknown) => {
      cleanup();
      reject(new FluxIQClientGatewayOpenError("closed_before_open", { cause: event }));
    };
    const timer = setTimeout(() => {
      cleanup();
      // Rejected before the close, so a socket whose close throws still leaves the caller a named failure.
      reject(new FluxIQClientGatewayOpenError("open_timeout", { timeoutMs }));
      socket.close();
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      removeListener(socket, "open", onOpen);
      removeListener(socket, "error", onError);
      removeListener(socket, "close", onClose);
    };
    addListener(socket, "open", onOpen);
    addListener(socket, "error", onError);
    addListener(socket, "close", onClose);
  });
}

function addListener(socket: FluxIQWebSocketLike, type: "open" | "message" | "close" | "error", listener: (event: unknown) => void): void {
  if (socket.addEventListener) socket.addEventListener(type, listener);
  else (socket as any)[`on${type}`] = listener;
}

function removeListener(socket: FluxIQWebSocketLike, type: "open" | "message" | "close" | "error", listener: (event: unknown) => void): void {
  if (socket.removeEventListener) socket.removeEventListener(type, listener);
  else if ((socket as any)[`on${type}`] === listener) (socket as any)[`on${type}`] = null;
}
