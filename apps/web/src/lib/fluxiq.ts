import { FluxIQ } from "fluxiq";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseAllowedOrigins, startClientGatewayWebSocketServer, type ClientGatewayWebSocketServerHandle } from "../server/client-gateway-websocket";

type FluxIQWebGlobal = typeof globalThis & {
  __fluxiqWebRuntime?: {
    instance: FluxIQ;
    clientGatewayServer: ClientGatewayWebSocketServerHandle | null;
    runtimeId: string;
  };
};

export function getFluxIQ(): FluxIQ {
  const state = getWebRuntimeState();
  startSharedClientGateway(state);
  return state.instance;
}

export function getFluxIQWebRuntimeStatus() {
  const state = getWebRuntimeState();
  return {
    runtimeId: state.runtimeId,
    clientGatewayPublicUrl: state.clientGatewayServer?.publicUrl ?? process.env.FLUXIQ_PUBLIC_CLIENT_WS_URL ?? null,
    clientGatewayStarted: Boolean(state.clientGatewayServer),
    clientGatewayListening: state.clientGatewayServer?.status.listening ?? false,
    clientGatewayError: state.clientGatewayServer?.status.error ?? null
  };
}

function getWebRuntimeState(): NonNullable<FluxIQWebGlobal["__fluxiqWebRuntime"]> {
  const globalState = globalThis as FluxIQWebGlobal;
  globalState.__fluxiqWebRuntime ??= {
    instance: FluxIQ.create({ rootDir: process.env.FLUXIQ_ROOT || findWorkspaceRoot(process.cwd()) }),
    clientGatewayServer: null,
    runtimeId: `web.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`
  };
  return globalState.__fluxiqWebRuntime;
}

function startSharedClientGateway(state: NonNullable<FluxIQWebGlobal["__fluxiqWebRuntime"]>): void {
  if (state.clientGatewayServer || process.env.FLUXIQ_CLIENT_GATEWAY_ENABLED === "false") return;
  const host = process.env.FLUXIQ_CLIENT_GATEWAY_HOST || "127.0.0.1";
  const port = Number(process.env.FLUXIQ_CLIENT_GATEWAY_PORT || 4777);
  const gatewayPath = process.env.FLUXIQ_CLIENT_GATEWAY_PATH || "/client";
  const publicHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  process.env.FLUXIQ_PUBLIC_CLIENT_WS_URL ??= `ws://${publicHost}:${port}${gatewayPath.startsWith("/") ? gatewayPath : `/${gatewayPath}`}`;
  const allowedOrigins = parseAllowedOrigins(process.env.FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS);
  state.clientGatewayServer = startClientGatewayWebSocketServer(allowedOrigins
    ? { gateway: state.instance.programs.clientGateway, host, port, path: gatewayPath, allowedOrigins }
    : { gateway: state.instance.programs.clientGateway, host, port, path: gatewayPath });
  console.info(`[FluxIQ] Client gateway WebSocket bound to shared runtime ${state.runtimeId} at ${state.clientGatewayServer.publicUrl}`);
}

function findWorkspaceRoot(startDir: string): string {
  let current = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml")) && existsSync(path.join(current, "packages", "fluxiq"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
}
