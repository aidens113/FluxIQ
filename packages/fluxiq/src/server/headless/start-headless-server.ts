import { once } from "node:events";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { FluxIQ } from "../../framework/index.ts";
import type { FluxNodeService } from "../../framework/automation-service/service/fluxnode/index.ts";
import { startClientGatewayWebSocketServer, type ClientGatewayWebSocketServerHandle } from "../client-gateway-websocket/index.ts";
import { programApiListener } from "./program-api-listener.ts";

/** Where a headless server listens. Both listeners bind loopback only. */
export type HeadlessServerOptions = {
  /** The instance whose gateway and programs are served; its storage must be ready. */
  fluxiq: FluxIQ;
  /** The program API's port; 0 picks a free one. Defaults to 3000, where a paired extension looks. */
  apiPort?: number;
  /** The client gateway's port; 0 picks a free one. Defaults to 4777, the gateway's own default. */
  gatewayPort?: number;
  /** The gateway's WebSocket path. Defaults to `/client`. */
  gatewayPath?: string;
  /** When given, the API listener also serves the FluxNode HTTP API (`/api/fluxnode/v1`) with it, in open mode. Without it those paths are 404. */
  fluxNodes?: FluxNodeService;
};

export type HeadlessServerHandle = {
  /** The program API's origin, e.g. `http://127.0.0.1:3000`. */
  apiUrl: string;
  /** The gateway's WebSocket URL, e.g. `ws://127.0.0.1:4777/client`. */
  gatewayUrl: string;
  api: HttpServer;
  gateway: ClientGatewayWebSocketServerHandle;
  /** Stops both listeners. The gateway's close waits for its open sockets, as the web panel's does. */
  close(): Promise<void>;
};

const HOST = "127.0.0.1";

/**
 * Serves FluxIQ without Next.js: the client gateway's WebSocket transport and
 * the program route, the same code the web panel runs, on loopback. The
 * gateway keeps the `local` profile's Origin rule and limits, and the program
 * route its allowlist, narrowing and IAM. Nothing here authenticates beyond
 * what those already do; keys come later (FluxNode plan, P3b).
 */
export async function startHeadlessServer(options: HeadlessServerOptions): Promise<HeadlessServerHandle> {
  const gateway = startClientGatewayWebSocketServer({
    gateway: options.fluxiq.programs.clientGateway,
    host: HOST,
    port: options.gatewayPort ?? 4777,
    path: options.gatewayPath ?? "/client",
    profile: "local"
  });
  try {
    await listening(gateway.server, () => gateway.status.error);
  } catch (error) {
    // The listener never bound, so closing it can only report that it is not running.
    await gateway.close().catch(/* best-effort: never bound, nothing to close */ () => undefined);
    throw error;
  }
  const api = createServer(programApiListener({ fluxiq: options.fluxiq }, options.fluxNodes));
  try {
    api.listen(options.apiPort ?? 3000, HOST);
    await listening(api, () => undefined);
  } catch (error) {
    await gateway.close();
    throw error;
  }
  return {
    apiUrl: `http://${HOST}:${portOf(api)}`,
    gatewayUrl: `ws://${HOST}:${portOf(gateway.server)}${gateway.path}`,
    api,
    gateway,
    close: async () => {
      await Promise.all([closeServer(api), gateway.close()]);
    }
  };
}

/** Resolves once the server listens; rejects with its listen error, or the reason the gateway recorded for it. */
async function listening(server: HttpServer, reason: () => string | undefined): Promise<void> {
  if (server.listening) return;
  const [event, error] = await Promise.race([
    once(server, "listening").then(() => ["listening", null] as const),
    once(server, "error").then(([failure]) => ["error", failure as Error] as const)
  ]);
  if (event === "error") throw new Error(reason() ?? error.message, { cause: error });
}

function portOf(server: HttpServer): number {
  return (server.address() as AddressInfo).port;
}

function closeServer(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
