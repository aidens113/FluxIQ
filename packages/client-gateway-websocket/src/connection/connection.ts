// The reconnecting client-gateway session: opening a socket, keeping it alive,
// reconnecting with backoff when it drops, and queueing outgoing messages in
// the outbox while it is down. It owns the socket and everything that
// describes the socket's health, and the client's trust lineage. It owns no
// recording state and knows nothing of the host: what the hello says, how a
// command is mapped, how the process stays alive and where the token is kept
// are the host's, through the options.

import type { ClientGatewayActionResult, ClientGatewayClientMessage } from "@fluxiq/contracts/client-gateway";
import { createClientGatewayMessage } from "../messages.ts";
import { clientGatewayLineageAfterReady, clientGatewayOutboxBinding, type ClientGatewayOutbox, type ClientGatewayOutboxBinding } from "../outbox/index.ts";
import { FluxIQClientGatewayWebSocketClient } from "../transport.ts";
import type { FluxIQClientGatewayWebSocketEventType, FluxIQClientGatewayWebSocketHandler } from "../types.ts";
import { clientGatewayOpenFailureMessage } from "./open-failure-message.ts";
import { clientGatewayReconnectDelay } from "./reconnect-delay.ts";
import type {
  ClientGatewayConnectionOptions,
  ClientGatewayConnectionSender,
  ClientGatewayConnectionState,
  ClientGatewayConnectionStatus
} from "./types.ts";

const DEFAULT_RECONNECT_BASE_DELAY_MS = 1_000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000;

type LooseSend = (type: ClientGatewayClientMessage["type"], payload: unknown, options?: { id?: string; timestamp?: number; correlationId?: string }) => Promise<unknown>;
type LooseCreate = (type: ClientGatewayClientMessage["type"], payload: unknown, options: { clientId?: string }) => ClientGatewayClientMessage;

// One socket's client and what the lineage rule needs to know about it.
type SocketRecord = {
  readonly client: FluxIQClientGatewayWebSocketClient;
  // The hello on this socket carried a token (its own, or the stored one).
  tokenInHello: boolean;
  // `server.pairing_required` came on this socket.
  pairingSeen: boolean;
  // `server.session_ready` came on this socket and its lineage is decided:
  // only then may client data cross it.
  ready: boolean;
  // Event types whose `on` subscriptions are already dispatched from this client.
  readonly dispatched: Set<FluxIQClientGatewayWebSocketEventType>;
};

export class FluxIQClientGatewayConnection {
  private readonly options: ClientGatewayConnectionOptions;
  private readonly subscriptions = new Map<FluxIQClientGatewayWebSocketEventType, Set<FluxIQClientGatewayWebSocketHandler>>();
  private current: SocketRecord | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private connectionState: ClientGatewayConnectionState = "disconnected";
  private lastMessageAt: number | undefined;
  private pairingReferenceCode: string | undefined;
  private queueSize = 0;
  private shouldStayConnected = false;
  // The trust lineage decided at the last `server.session_ready` in this process.
  private currentLineage: string | undefined;

  constructor(options: ClientGatewayConnectionOptions) {
    this.options = options;
  }

  state(): ClientGatewayConnectionState {
    return this.connectionState;
  }

  statusFields(): ClientGatewayConnectionStatus {
    return {
      connectionState: this.connectionState,
      queueSize: this.queueSize,
      lastMessageAt: this.lastMessageAt,
      pairingReferenceCode: this.pairingReferenceCode
    };
  }

  async connect(): Promise<void> {
    this.shouldStayConnected = true;
    this.clearReconnect();
    this.setState("connecting");
    await this.options.beforeConnect?.();
    await this.current?.client.close();
    const record = this.openRecord();
    this.current = record;
    this.attachClientHandlers(record);
    try {
      await record.client.connect();
    } catch (error) {
      // An attempt a newer connect() replaced -- a second Connect, a reconnect --
      // owns nothing any more: failing here would mark the live attempt failed
      // and schedule a reconnect that closes its socket.
      if (this.current !== record) return;
      this.fail(clientGatewayOpenFailureMessage(error));
      if (this.shouldStayConnected && this.options.autoReconnect()) this.scheduleReconnect();
    }
  }

  /** Stops the connection reconnecting on its own. Separate from closing the socket so a host can tear down in its own order. */
  stopReconnecting(): void {
    this.shouldStayConnected = false;
    this.clearReconnect();
  }

  /**
   * Tries again at once when the connection is waiting out a backoff, or failed
   * while it still wants to be connected, and starts the backoff over. For the
   * moments something says the way to FluxIQ may be open again -- the network
   * came back, a wake-up fired -- so nobody waits out a retry already due. A
   * connection nobody wants, or one already connecting or connected, is left alone.
   */
  retryNow(): boolean {
    if (!this.shouldStayConnected) return false;
    if (this.connectionState !== "reconnecting" && this.connectionState !== "error") return false;
    this.reconnectAttempt = 0;
    this.connect().catch((error: unknown) => {
      this.fail(error instanceof Error ? error.message : "WebSocket connection failed.");
    });
    return true;
  }

  /** The connection was asked to connect and has not been told to stop. */
  wantsConnection(): boolean {
    return this.shouldStayConnected;
  }

  closeClient(): void {
    this.stopHeartbeat();
    void this.current?.client.close();
    this.current = null;
  }

  markDisconnected(): void {
    this.setState("disconnected");
  }

  markSessionReady(): void {
    this.pairingReferenceCode = undefined;
    this.setState("connected");
  }

  markFailed(): void {
    this.setState("error");
  }

  noteMessageReceived(): void {
    this.lastMessageAt = Date.now();
  }

  /**
   * Subscribes to a transport event on every socket this connection opens, the
   * current one included, until the returned function is called. Unlike a
   * subscription on one socket's client, it survives reconnects.
   */
  on<TType extends FluxIQClientGatewayWebSocketEventType>(type: TType, handler: FluxIQClientGatewayWebSocketHandler<TType>): () => void {
    const set = this.subscriptions.get(type) ?? new Set();
    set.add(handler as unknown as FluxIQClientGatewayWebSocketHandler);
    this.subscriptions.set(type, set);
    if (this.current) this.dispatchSubscriptions(this.current, type);
    return () => {
      set.delete(handler as unknown as FluxIQClientGatewayWebSocketHandler);
    };
  }

  /**
   * Sends over a socket whose session is ready, or queues the message in the
   * outbox bound to the current trust lineage, project and recording, to be
   * delivered after the next `server.session_ready` only where that binding
   * still holds. A socket that is open but still pairing, or whose token the
   * gateway is still checking, carries no client data: an unapproved session
   * may not receive it, so it waits in the queue like any other.
   */
  readonly send: ClientGatewayConnectionSender = async (type, payload) => {
    const client = this.current?.ready ? this.current.client : undefined;
    if (client?.connected) {
      await (client.send as LooseSend)(type, payload);
      return;
    }
    const context = this.options.context();
    const clientId = this.options.clientId();
    const message = (createClientGatewayMessage as LooseCreate)(type, payload, clientId !== undefined ? { clientId } : {});
    const binding = clientGatewayOutboxBinding(message, await this.lineage(), context);
    this.queueSize = await this.options.outbox.enqueue(message, binding);
    this.options.emitStatus();
  };

  /**
   * The result the outbox holds for a command id under the current lineage,
   * when it holds one: a command whose result was queued while the socket was
   * down is answered with it, never run again. A queued `interrupted` reads as
   * `unknown`, never as "did not act".
   */
  async queuedActionResult(commandId: string): Promise<ClientGatewayActionResult | undefined> {
    return await this.options.outbox.actionResult(commandId, await this.lineage());
  }

  /**
   * Delivers the queued messages whose binding matches the current lineage,
   * project and recording, straight on the socket, and drops the rest. When
   * queued messages were lost, the outbox sends the gateway its loss marker
   * first and the host hears of it through `onQueueLoss` once the flush is
   * done. A send that fails leaves the undelivered matching tail (and an
   * unsent loss) queued and rethrows.
   */
  async flushQueue(): Promise<void> {
    const client = this.current?.client;
    if (!client?.connected) return;
    const context = this.options.context();
    const current: ClientGatewayOutboxBinding = { session: await this.lineage(), projectId: context.projectId, recordingId: context.recordingId };
    let outcome: Awaited<ReturnType<ClientGatewayOutbox["flush"]>>;
    try {
      // A queued message reaches the gateway as it was queued: its id,
      // timestamp and correlation id survive (D16); the session id is this socket's.
      outcome = await this.options.outbox.flush(current, (message) => (client.send as LooseSend)(message.type, message.payload, {
        id: message.id,
        timestamp: message.timestamp,
        ...(message.correlationId !== undefined ? { correlationId: message.correlationId } : {})
      }));
    } finally {
      await this.refreshQueueSize();
    }
    if (outcome.lost) this.options.handlers.onQueueLoss?.(outcome.lost);
  }

  /** Removes the queued recording events sent under `eventId`, and answers how many there were. */
  async removeQueuedRecordingEvent(eventId: string): Promise<number> {
    const removed = await this.options.outbox.removeRecordingEvent(eventId);
    if (removed > 0) await this.refreshQueueSize();
    return removed;
  }

  /**
   * Reads the queue size from the outbox, which outlives this process, and
   * answers it; the status is published only when the size changed, so a host
   * that refreshes on every status read does not broadcast on every read.
   */
  async refreshQueueSize(): Promise<number> {
    const size = await this.options.outbox.size();
    if (size !== this.queueSize) {
      this.queueSize = size;
      this.options.emitStatus();
    }
    return size;
  }

  // Reaching `connected` ends whatever went wrong before it: a failed socket, a
  // wait for approval, a refused reconnect. An error that outlived the
  // connection it described would sit under "Connected" and read as current,
  // so it is cleared on every transition into `connected`.
  private setState(state: ClientGatewayConnectionState): void {
    this.connectionState = state;
    if (state === "connected") this.options.clearError();
    this.options.emitStatus();
  }

  // The lineage a message is bound to: this process's decision, else the one
  // the outbox kept from an earlier process, else none yet.
  private async lineage(): Promise<string> {
    return this.currentLineage ?? (await this.options.outbox.lineage()) ?? "";
  }

  private openRecord(): SocketRecord {
    const hello = this.options.hello();
    const tokenStorage = this.options.tokenStorage;
    const record: SocketRecord = {
      client: new FluxIQClientGatewayWebSocketClient({
        url: this.options.url(),
        client: hello,
        ...(this.options.WebSocketImpl !== undefined ? { WebSocketImpl: this.options.WebSocketImpl } : {}),
        ...(this.options.openTimeoutMs !== undefined ? { openTimeoutMs: this.options.openTimeoutMs } : {}),
        tokenStorage: {
          // The transport reads the stored token once per socket, after it opens
          // and before it sends the hello: the moment to learn whether the hello
          // carries a token, which is what the lineage rule and the state need.
          read: async () => {
            const stored = await tokenStorage.read();
            this.onHelloToken(record, Boolean(hello.token ?? stored));
            return stored;
          },
          write: (token) => tokenStorage.write(token),
          ...(tokenStorage.clear !== undefined ? { clear: () => tokenStorage.clear?.() } : {})
        }
      }),
      tokenInHello: false,
      pairingSeen: false,
      ready: false,
      dispatched: new Set()
    };
    return record;
  }

  // A socket a newer connect() replaced. Its late events (a close the browser
  // delivers after the new socket exists) describe nothing current.
  private superseded(record: SocketRecord): boolean {
    return this.current !== null && this.current !== record;
  }

  private onHelloToken(record: SocketRecord, carried: boolean): void {
    record.tokenInHello = carried;
    if (!this.superseded(record)) this.setState(carried ? "connecting" : "pairing");
  }

  private onOpen(record: SocketRecord): void {
    if (this.superseded(record)) return;
    this.reconnectAttempt = 0;
    this.options.clearError();
    this.startHeartbeat();
  }

  private onClose(record: SocketRecord): void {
    if (this.superseded(record)) return;
    this.stopHeartbeat();
    this.current = null;
    if (this.shouldStayConnected && this.options.autoReconnect()) {
      this.scheduleReconnect();
    } else {
      this.setState("disconnected");
    }
  }

  // Decides the trust lineage for this socket and stores it before the host
  // hears the session is ready, so a flush the host starts then binds to it.
  // An outbox whose lineage cannot be read fails closed: the failure is
  // reported and a new lineage is minted, so nothing queued is delivered to a
  // trust it cannot be shown to belong to.
  private async onSessionReady(record: SocketRecord): Promise<void> {
    const outbox = this.options.outbox;
    let resumed = record.tokenInHello && !record.pairingSeen;
    let stored: string | undefined;
    try {
      stored = await outbox.lineage();
    } catch (error) {
      resumed = false;
      this.options.reportError(error instanceof Error ? `Could not read the connection lineage, so a new one was started: ${error.message}` : "Could not read the connection lineage, so a new one was started.");
    }
    const lineage = clientGatewayLineageAfterReady({
      stored,
      resumed,
      mint: () => this.options.mintLineage?.() ?? globalThis.crypto.randomUUID()
    });
    this.currentLineage = lineage;
    try {
      await outbox.setLineage(lineage);
    } catch (error) {
      this.options.reportError(error instanceof Error ? error.message : "Could not store the connection lineage.");
    }
  }

  private fail(message: string): void {
    this.options.reportError(message);
    this.setState("error");
  }

  private attachClientHandlers(record: SocketRecord): void {
    const { client } = record;
    const handlers = this.options.handlers;
    client.on("open", () => this.onOpen(record));
    client.on("close", () => this.onClose(record));
    client.on("error", () => {
      if (!this.superseded(record)) this.fail("WebSocket connection failed.");
    });
    client.on("message", ({ message }) => handlers.onServerMessage?.(message));
    client.on("pairing_required", ({ message }) => {
      record.pairingSeen = true;
      this.pairingReferenceCode = message.payload.referenceCode;
      this.setState("pairing");
      handlers.onPairingRequired?.(this.pairingReferenceCode, message.payload.reason);
    });
    client.on("session_ready", async ({ message }) => {
      await this.onSessionReady(record);
      record.ready = true;
      handlers.onSessionReady?.(message);
    });
    for (const type of this.subscriptions.keys()) this.dispatchSubscriptions(record, type);
  }

  // One dispatcher per event type per client, reading the live subscription
  // set, so a later `on` or an unsubscribe takes effect on the open socket.
  private dispatchSubscriptions(record: SocketRecord, type: FluxIQClientGatewayWebSocketEventType): void {
    if (record.dispatched.has(type)) return;
    record.dispatched.add(type);
    record.client.on(type, (event) => {
      for (const handler of [...(this.subscriptions.get(type) ?? [])]) void handler(event);
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connectionState === "connected") this.options.handlers.onHeartbeat?.();
      else if (this.connectionState === "pairing" || this.connectionState === "connecting") this.options.handlers.keepAlive?.();
    }, this.options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.setState("reconnecting");
    const delay = clientGatewayReconnectDelay(this.reconnectAttempt, {
      baseDelayMs: this.options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS,
      maxDelayMs: this.options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS
    });
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => void this.connect(), delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }
}
