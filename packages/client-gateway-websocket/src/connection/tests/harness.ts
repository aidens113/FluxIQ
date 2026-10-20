import { vi } from "vitest";
import type { ClientGatewayServerMessage } from "@fluxiq/contracts/client-gateway";
import {
  ClientGatewayOutbox,
  clientGatewayMemoryOutboxStore,
  type ClientGatewayOutboxContext,
  type ClientGatewayOutboxLoss,
  type ClientGatewayOutboxStore
} from "../../outbox/index.ts";
import { FluxIQClientGatewayConnection, type ClientGatewayConnectionOptions } from "../index.ts";
import { FakeSocket } from "./fake-socket.ts";

// Builds a connection over `FakeSocket` with every host hook recorded. The
// token is a synthetic placeholder: no real credential appears in these tests.

export const SYNTHETIC_TOKEN = "synthetic-token.0";

export type HarnessOptions = {
  token?: string;
  autoReconnect?: boolean;
  openTimeoutMs?: number;
  store?: ClientGatewayOutboxStore;
  /** The outbox's limits (default: the outbox's own). */
  outboxLimits?: { limit?: number; byteBudget?: number };
  /** Run when `server.session_ready` reaches the host, after the lineage is decided. Defaults to marking ready and flushing, as a host does. */
  onSessionReady?: (connection: FluxIQClientGatewayConnection, message: Extract<ClientGatewayServerMessage, { type: "server.session_ready" }>) => void | Promise<void>;
  overrides?: Partial<ClientGatewayConnectionOptions>;
};

export function harness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const ticks: string[] = [];
  const pairing: Array<{ referenceCode: string | undefined; reason: string }> = [];
  const lineagesAtReady: Array<string | undefined> = [];
  const losses: ClientGatewayOutboxLoss[] = [];
  const tokens = { stored: options.token };
  const context: ClientGatewayOutboxContext = { projectId: "project.1", recordingId: null };
  const store = options.store ?? clientGatewayMemoryOutboxStore();
  const outbox = new ClientGatewayOutbox(store, options.outboxLimits ?? {});
  let minted = 0;
  let readyWork: Promise<void> = Promise.resolve();
  const connection: FluxIQClientGatewayConnection = new FluxIQClientGatewayConnection({
    url: () => "ws://gateway.test/client",
    hello: () => ({ clientId: "client.1", clientType: "extension", name: "Test client" }),
    tokenStorage: {
      read: () => tokens.stored,
      write: (token) => { tokens.stored = token; }
    },
    WebSocketImpl: FakeSocket,
    ...(options.openTimeoutMs !== undefined ? { openTimeoutMs: options.openTimeoutMs } : {}),
    autoReconnect: () => options.autoReconnect ?? false,
    outbox,
    context: () => ({ ...context }),
    clientId: () => "client.1",
    mintLineage: () => `lineage.${++minted}`,
    emitStatus: () => events.push("emit"),
    reportError: (message) => events.push(`error ${message}`),
    clearError: () => events.push("clearError"),
    handlers: {
      onPairingRequired: (referenceCode, reason) => pairing.push({ referenceCode, reason }),
      onSessionReady: (message) => {
        readyWork = (async () => {
          lineagesAtReady.push(await outbox.lineage().catch(() => "unreadable"));
          if (options.onSessionReady) await options.onSessionReady(connection, message);
          else {
            connection.markSessionReady();
            await connection.flushQueue();
          }
        })();
      },
      onHeartbeat: () => ticks.push("heartbeat"),
      keepAlive: () => ticks.push("keepAlive"),
      onQueueLoss: (loss) => losses.push(loss)
    },
    ...options.overrides
  });
  return {
    connection,
    events,
    ticks,
    pairing,
    lineagesAtReady,
    losses,
    tokens,
    context,
    store,
    outbox,
    /** Lets queued microtasks, the socket's next-turn open and the host's ready work run. */
    async settle(): Promise<void> {
      await vi.advanceTimersByTimeAsync(0);
      await readyWork;
      await vi.advanceTimersByTimeAsync(0);
    }
  };
}

/** Connects, lets the socket open, and has the gateway accept the session with `token`. */
export async function connectReady(h: ReturnType<typeof harness>, token = SYNTHETIC_TOKEN): Promise<FakeSocket> {
  const connecting = h.connection.connect();
  await h.settle();
  await connecting;
  const socket = FakeSocket.latest();
  socket.serverSays("server.session_ready", { sessionId: `wire.${FakeSocket.created.length}`, token });
  await h.settle();
  return socket;
}
