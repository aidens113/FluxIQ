import { createServer, type IncomingMessage, type Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import type { ClientGatewayGoingAwayNotice, ClientGatewayService } from "../../client-gateway/index.ts";
import type { FluxIQDeploymentSettings } from "../../platform/profile/index.ts";
import type { TrustedModuleBuildIdentity } from "../../runtime/build-identity/modules/index.ts";
import { acceptClientGatewaySocket } from "./accept-socket.ts";
import { resolveClientGatewayPeer } from "./client-peer.ts";
import type { NativeWebSocketConnection } from "./native-connection.ts";
import { createClientGatewayOriginPolicy, type ClientGatewayOriginPolicy } from "./origin-policy.ts";
import { rejectUpgrade } from "./reject-upgrade.ts";
import { ClientGatewayTransportIdentityLeases, type ClientGatewayResolver } from "./routing/index.ts";
import { serverEnvelope } from "./server-envelope.ts";
import { resolveClientGatewayTransportLimits, type ClientGatewayTransportLimits } from "./transport-limits.ts";

export type ClientGatewayWebSocketServerOptions = {
  gateway: ClientGatewayService;
  /** Trusted first-hello authority. Null/error refuses; the default gateway is never a routing fallback. */
  resolveGateway?: ClientGatewayResolver | undefined;
  host?: string;
  port?: number;
  path?: string;
  /** Raw allowlist entries (`FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS`), judged by the contract's Origin grammar at start. */
  allowedOrigins?: string[];
  /** The deployment profile (`FLUXIQ_PROFILE`); `local` when unset. */
  profile?: FluxIQDeploymentSettings["profile"];
  /** The URL clients are told to connect to (`FLUXIQ_PUBLIC_CLIENT_WS_URL`); derived from the bind when unset. */
  publicUrl?: string;
  /** Take the client's address from the rightmost `X-Forwarded-For` entry (`FLUXIQ_TRUST_PROXY`). */
  trustProxy?: boolean;
  /** Frame, hello, rate and pending-pairing limits; each one left out keeps a local install's behaviour. */
  limits?: Partial<FluxIQDeploymentSettings["gateway"]["limits"]>;
  /**
   * The build identity of the server artifact that executes this transport,
   * bound to the gateway while the listener is up. The web panel's native
   * gateway bundle reads its stamped identity and passes it
   * (`apps/web/src/server/client-gateway-websocket.ts`); left out, the gateway
   * is bound with none, as an unstamped build always was.
   */
  buildIdentity?: TrustedModuleBuildIdentity | null;
};

/** Why and for how long the gateway is draining; `reason` defaults to `restart`. */
export type ClientGatewayDrainInput = { retryAfterMs: number; reason?: ClientGatewayGoingAwayNotice["reason"] };

export type ClientGatewayWebSocketServerHandle = {
  server: HttpServer;
  host: string;
  port: number;
  path: string;
  publicUrl: string;
  status: { listening: boolean; error?: string };
  /**
   * Starts draining: new upgrades are answered 503 with `Retry-After`, and
   * every open socket is sent `server.going_away` once. Sockets are left open
   * for their clients to close; `close` ends the listener.
   */
  beginDrain(input: ClientGatewayDrainInput): void;
  /** How many WebSocket connections are open now. */
  openConnectionCount(): number;
  close(): Promise<void>;
};

type TransportState = {
  gateway: ClientGatewayService;
  resolveGateway: ClientGatewayResolver | undefined;
  identities: ClientGatewayTransportIdentityLeases;
  path: string;
  originPolicy: ClientGatewayOriginPolicy;
  limits: ClientGatewayTransportLimits;
  trustProxy: boolean;
  connections: Set<NativeWebSocketConnection>;
  notified: WeakSet<NativeWebSocketConnection>;
  drain: ClientGatewayGoingAwayNotice | null;
  closing: boolean;
  pendingReleases: Set<Promise<void>>;
  cleanupFailed: boolean;
};

export function startClientGatewayWebSocketServer(options: ClientGatewayWebSocketServerOptions): ClientGatewayWebSocketServerHandle {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4777;
  const path = normalizePath(options.path ?? "/client");
  const originPolicy = createClientGatewayOriginPolicy({ profile: options.profile ?? "local", host, allowedOrigins: options.allowedOrigins, warn: (message) => console.warn(message) });
  const limits = resolveClientGatewayTransportLimits(options.limits);
  const publicHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  const publicUrl = options.publicUrl ?? `ws://${publicHost}:${port}${path}`;
  const status: ClientGatewayWebSocketServerHandle["status"] = { listening: false };
  const identities = new ClientGatewayTransportIdentityLeases(options.buildIdentity, options.limits === undefined ? undefined : limits);
  // A local/default gateway is bound before IO. Routed gateways are bound only after authority resolves them.
  if (!options.resolveGateway) identities.acquire(options.gateway);
  const state: TransportState = { gateway: options.gateway, resolveGateway: options.resolveGateway, identities, path, originPolicy, limits, trustProxy: options.trustProxy === true, connections: new Set(), notified: new WeakSet(), drain: null, closing: false, pendingReleases: new Set(), cleanupFailed: false };
  const server = createServer((request, response) => {
    const requestPath = request.url ? new URL(request.url, "http://localhost").pathname : "/";
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      ok: true,
      service: "fluxiq-client-gateway",
      websocketPath: path,
      publicUrl,
      listening: status.listening,
      draining: state.drain !== null,
      error: status.error ?? null,
      accepts: requestPath === path ? "websocket-upgrade" : "health"
    }));
  });

  let finalization: Promise<void> | null = null;
  const finalize = (): Promise<void> => {
    finalization ??= finishReleases(state);
    return finalization;
  };
  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => handleUpgrade(state, request, socket, head));
  server.on("close", () => {
    status.listening = false;
    void finalize().catch((error: unknown) => {
      status.error = "Client gateway route cleanup failed.";
      recordCleanupFailure(state.gateway, "listener_close", error);
    });
  });
  server.on("error", (error: NodeJS.ErrnoException) => {
    state.closing = true;
    for (const connection of state.connections) connection.terminate(1011, "listener error");
    void finalize().catch((error: unknown) => {
      status.error = "Client gateway route cleanup failed.";
      recordCleanupFailure(state.gateway, "listener_error", error);
    });
    status.listening = false;
    status.error = error.code === "EADDRINUSE"
      ? `Port ${port} is already in use. Stop the old FluxIQ dev server or change FLUXIQ_CLIENT_GATEWAY_PORT.`
      : error.message;
    console.warn(`[FluxIQ] Client gateway WebSocket server error: ${error.message}`);
  });
  server.on("listening", () => {
    identities.activate();
    status.listening = true;
    delete status.error;
  });

  try {
    server.listen(port, host);
  } catch (error) {
    identities.close();
    throw error;
  }

  let closing: Promise<void> | null = null;
  return {
    server,
    host,
    port,
    path,
    publicUrl,
    status,
    beginDrain: (input) => beginDrain(state, input),
    openConnectionCount: () => state.connections.size,
    close: () => {
      if (closing) return closing;
      state.closing = true;
      for (const connection of state.connections) connection.terminate(1001, "server shutdown");
      closing = new Promise<void>((resolve, reject) => server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        void finalize().then(resolve, reject);
      }));
      return closing;
    }
  };
}

function handleUpgrade(state: TransportState, request: IncomingMessage, socket: Duplex, head: Buffer): void {
  const requestPath = request.url ? new URL(request.url, "http://localhost").pathname : "/";
  if (requestPath !== state.path) {
    rejectUpgrade(socket, 404, "Not Found");
    return;
  }
  if (state.closing || state.drain !== null) {
    rejectUpgrade(socket, 503, "Service Unavailable", { "Retry-After": String(Math.ceil((state.drain?.retryAfterMs ?? 0) / 1000)) });
    return;
  }
  const peer = resolveClientGatewayPeer(request, state.trustProxy);
  const origin = request.headers.origin;
  const verdict = state.originPolicy.admit(origin);
  if (!verdict.admitted) {
    state.gateway.recordTransportEvent("transport.origin_refused", "A WebSocket upgrade was refused for its Origin.", {
      reason: verdict.reason,
      origin: origin === undefined ? null : origin.slice(0, 200),
      clientAddressPrefix: peer.prefix
    });
    rejectUpgrade(socket, 403, "Forbidden");
    return;
  }
  if (state.gateway.snapshot().enabled === false) {
    rejectUpgrade(socket, 503, "Client Gateway Disabled");
    return;
  }
  const connection = acceptClientGatewaySocket({
    gateway: state.gateway,
    resolveGateway: state.resolveGateway,
    identities: state.identities,
    request,
    socket,
    head,
    limits: state.limits,
    peer,
    onClosed: (closed) => state.connections.delete(closed),
    onRelease: (pending) => {
      state.pendingReleases.add(pending);
      void pending.then(() => state.pendingReleases.delete(pending), (error: unknown) => {
        state.pendingReleases.delete(pending);
        state.cleanupFailed = true;
        recordCleanupFailure(state.gateway, "route_release", error);
      });
    }
  });
  if (connection?.open) state.connections.add(connection);
}

function beginDrain(state: TransportState, input: ClientGatewayDrainInput): void {
  if (typeof input.retryAfterMs !== "number" || !Number.isFinite(input.retryAfterMs) || input.retryAfterMs < 0) {
    throw new Error("beginDrain needs retryAfterMs, a non-negative number of milliseconds.");
  }
  const notice: ClientGatewayGoingAwayNotice = { reason: input.reason ?? "restart", retryAfterMs: Math.round(input.retryAfterMs) };
  state.drain = notice;
  for (const connection of state.connections) {
    if (state.notified.has(connection)) continue;
    state.notified.add(connection);
    connection.send(serverEnvelope("server.going_away", notice));
  }
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

async function finishReleases(state: TransportState): Promise<void> {
  // Unresolved user resolvers are aborted by socket closure, never awaited here. Late leases release on arrival.
  while (state.pendingReleases.size) await Promise.allSettled([...state.pendingReleases]);
  state.identities.close();
  if (state.cleanupFailed) throw new Error("Client gateway route cleanup failed.");
}

function recordCleanupFailure(gateway: ClientGatewayService, phase: "listener_close" | "listener_error" | "route_release", error: unknown): void {
  // A user-supplied resolver/release may put credentials in an exception. Only classify it here.
  gateway.recordTransportEvent("transport.route_cleanup_failed", "Client gateway route cleanup failed.", {
    phase,
    failureKind: error instanceof Error ? "error" : "rejection"
  });
}
