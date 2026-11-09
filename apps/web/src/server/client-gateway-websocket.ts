// The client gateway's WebSocket server as the web panel runs it: Core's
// transport (`fluxiq/server`), bound to the build identity stamped into this
// native bundle (`scripts/build-client-gateway-server.mjs`, which keeps
// `fluxiq/*` external, so the bundle holds this file and the identity reader).
import { readServerBuildIdentity } from "./build-identity";
import {
  startClientGatewayWebSocketServer as startCoreClientGatewayWebSocketServer,
  type ClientGatewayWebSocketServerHandle,
  type ClientGatewayWebSocketServerOptions as CoreClientGatewayWebSocketServerOptions
} from "fluxiq/server";

export { isLoopbackHost, parseAllowedOrigins } from "fluxiq/server";
export type { ClientGatewayDrainInput, ClientGatewayWebSocketServerHandle } from "fluxiq/server";

/** The transport's options; the build identity is always this bundle's own. */
export type ClientGatewayWebSocketServerOptions = Omit<CoreClientGatewayWebSocketServerOptions, "buildIdentity">;

export function startClientGatewayWebSocketServer(options: ClientGatewayWebSocketServerOptions): ClientGatewayWebSocketServerHandle {
  return startCoreClientGatewayWebSocketServer({ ...options, buildIdentity: readServerBuildIdentity() });
}
