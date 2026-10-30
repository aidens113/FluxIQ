import { readServerBuildIdentity } from "./build-identity";
import { createServer, type IncomingMessage, type Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import type { ClientGatewayGoingAwayNotice, ClientGatewayService } from "fluxiq/client-gateway";
import type { FluxIQDeploymentSettings } from "fluxiq/platform/profile";
import {
  acceptClientGatewaySocket,
  createClientGatewayOriginPolicy,
  rejectUpgrade,
  resolveClientGatewayPeer,
  resolveClientGatewayTransportLimits,
  serverEnvelope,
  type ClientGatewayOriginPolicy,
  type ClientGatewayTransportLimits,
  type NativeWebSocketConnection
} from "./client-gateway-websocket/index.ts";

export { isLoopbackHost, parseAllowedOrigins } from "./client-gateway-websocket/index.ts";

export type ClientGatewayWebSocketServerOptions = {
  gateway: ClientGatewayService;
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
  path: string;
  originPolicy: ClientGatewayOriginPolicy;
  limits: ClientGatewayTransportLimits;
  trustProxy: boolean;
  connections: Set<NativeWebSocketConnection>;
  notified: WeakSet<NativeWebSocketConnection>;
  drain: ClientGatewayGoingAwayNotice | null;
};

export function startClientGatewayWebSocketServer(options: ClientGatewayWebSocketServerOptions): ClientGatewayWebSocketServerHandle {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4777;
  const path = normalizePath(options.path ?? "/client");
  const originPolicy = createClientGatewayOriginPolicy({ profile: options.profile ?? "local", host, allowedOrigins: options.allowedOrigins, warn: (message) => console.warn(message) });
  const limits = resolveClientGatewayTransportLimits(options.limits);
  if (options.limits !== undefined) options.gateway.setPairingLimits({ perAddress: limits.pendingPairingsPerAddress, total: limits.pendingPairingsTotal });
  const publicHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  const publicUrl = options.publicUrl ?? `ws://${publicHost}:${port}${path}`;
  const status: ClientGatewayWebSocketServerHandle["status"] = { listening: false };
  const state: TransportState = { gateway: options.gateway, path, originPolicy, limits, trustProxy: options.trustProxy === true, connections: new Set(), notified: new WeakSet(), drain: null };
  // Capture the original immutable anchor before listener or socket IO.
  const lease = options.gateway.bindTransportBuildIdentity(readServerBuildIdentity());
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

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => handleUpgrade(state, request, socket, head));
  server.on("close", () => { status.listening = false; lease.release(); });
  server.on("error", (error: NodeJS.ErrnoException) => {
    lease.release();
    status.listening = false;
    status.error = error.code === "EADDRINUSE"
      ? `Port ${port} is already in use. Stop the old FluxIQ dev server or change FLUXIQ_CLIENT_GATEWAY_PORT.`
      : error.message;
    console.warn(`[FluxIQ] Client gateway WebSocket server error: ${error.message}`);
  });
  server.on("listening", () => {
    lease.activate();
    status.listening = true;
    delete status.error;
  });

  try { server.listen(port, host); } catch (error) { lease.release(); throw error; }

  return {
    server,
    host,
    port,
    path,
    publicUrl,
    status,
    beginDrain: (input) => beginDrain(state, input),
    openConnectionCount: () => state.connections.size,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function handleUpgrade(state: TransportState, request: IncomingMessage, socket: Duplex, head: Buffer): void {
  const requestPath = request.url ? new URL(request.url, "http://localhost").pathname : "/";
  if (requestPath !== state.path) {
    rejectUpgrade(socket, 404, "Not Found");
    return;
  }
  if (state.drain !== null) {
    rejectUpgrade(socket, 503, "Service Unavailable", { "Retry-After": String(Math.ceil(state.drain.retryAfterMs / 1000)) });
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
    request,
    socket,
    head,
    limits: state.limits,
    peer,
    onClosed: (closed) => state.connections.delete(closed)
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
