import { FluxIQ } from "fluxiq";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseAllowedOrigins, startClientGatewayWebSocketServer, type ClientGatewayWebSocketServerHandle } from "../server/client-gateway-websocket";

type FluxIQWebGlobal = typeof globalThis & {
  __fluxiqWebRuntime?: {
    instance: FluxIQ;
    clientGatewayServer: ClientGatewayWebSocketServerHandle | null;
    runtimeId: string;
    automationStudioContext: {
      activeProjectId: string | null;
      updatedAt: number;
    };
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
    hostRoot: state.instance.paths.root,
    fluxiqDir: state.instance.paths.fluxiq,
    clientGatewayPublicUrl: state.clientGatewayServer?.publicUrl ?? process.env.FLUXIQ_PUBLIC_CLIENT_WS_URL ?? null,
    clientGatewayStarted: Boolean(state.clientGatewayServer),
    clientGatewayListening: state.clientGatewayServer?.status.listening ?? false,
    clientGatewayError: state.clientGatewayServer?.status.error ?? null,
    automationStudio: {
      activeProjectId: state.automationStudioContext.activeProjectId,
      updatedAt: state.automationStudioContext.updatedAt
    }
  };
}

export function setAutomationStudioWebContext(input: { activeProjectId: string | null }): void {
  const state = getWebRuntimeState();
  state.automationStudioContext = {
    activeProjectId: input.activeProjectId,
    updatedAt: Date.now()
  };
}

function getWebRuntimeState(): NonNullable<FluxIQWebGlobal["__fluxiqWebRuntime"]> {
  const globalState = globalThis as FluxIQWebGlobal;
  globalState.__fluxiqWebRuntime ??= {
    instance: FluxIQ.create({ rootDir: resolveFluxIQWebHostRoot(process.cwd()) }),
    clientGatewayServer: null,
    runtimeId: `web.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`,
    automationStudioContext: { activeProjectId: null, updatedAt: 0 }
  };
  globalState.__fluxiqWebRuntime.instance.programs.automationStudioClientGateway.setClientRecordingContextProvider(() => {
    const context = globalState.__fluxiqWebRuntime?.automationStudioContext;
    const isFresh = context ? Date.now() - context.updatedAt < 10_000 : false;
    if (context?.activeProjectId && isFresh) return { ok: true, projectId: context.activeProjectId };
    return {
      ok: false,
      message: "Recording cannot start because Automation Studio does not have an open project.",
      code: "recording.project_required",
      metadata: { activeProjectId: context?.activeProjectId ?? null, contextUpdatedAt: context?.updatedAt ?? 0 }
    };
  });
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

export function resolveFluxIQWebHostRoot(startDir: string): string {
  const explicitRoot = process.env.FLUXIQ_IMPORTER_ROOT || process.env.FLUXIQ_HOST_ROOT || process.env.FLUXIQ_ROOT;
  if (explicitRoot?.trim()) return path.resolve(explicitRoot.trim());
  const root = findWorkspaceRoot(startDir);
  if (isFluxIQSourceCheckout(root) && process.env.FLUXIQ_ALLOW_FRAMEWORK_REPO_ROOT !== "true") {
    throw new Error([
      "FluxIQ web panel needs an importing repository root for runtime state.",
      `Refusing to use the FluxIQ framework source checkout as the host root: ${root}`,
      "Set FLUXIQ_IMPORTER_ROOT, FLUXIQ_HOST_ROOT, or FLUXIQ_ROOT to the repo that owns .fluxiq data.",
      "For one-off framework development only, set FLUXIQ_ALLOW_FRAMEWORK_REPO_ROOT=true."
    ].join(" "));
  }
  return root;
}

function isFluxIQSourceCheckout(root: string): boolean {
  return existsSync(path.join(root, "pnpm-workspace.yaml"))
    && existsSync(path.join(root, "packages", "fluxiq", "src", "framework", "index.ts"))
    && existsSync(path.join(root, "apps", "web", "package.json"));
}
