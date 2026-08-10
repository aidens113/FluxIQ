import { FluxIQ } from "fluxiq";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parseAllowedOrigins, startClientGatewayWebSocketServer, type ClientGatewayWebSocketServerHandle } from "../server/client-gateway-websocket";
import { resolveAutomationStudioContext, resolveClientRecordingProject, setAutomationStudioContext, type AutomationStudioWebContext } from "./automation-studio-context";

type FluxIQHostModuleRegistration = (fluxiq: FluxIQ) => FluxIQ | void;

type FluxIQWebGlobal = typeof globalThis & {
  __fluxiqWebRuntime?: {
    instance: FluxIQ;
    hostModulePath: string | null;
    clientGatewayServer: ClientGatewayWebSocketServerHandle | null;
    runtimeId: string;
    automationStudioContexts: Record<string, AutomationStudioWebContext>;
  };
};

const hostModuleRequire = createRequire(path.join(process.cwd(), "package.json"));

export function getFluxIQ(): FluxIQ {
  const state = getWebRuntimeState();
  startSharedClientGateway(state);
  return state.instance;
}

export function getFluxIQWebRuntimeStatus(operatorUserId?: string) {
  const state = getWebRuntimeState();
  const context = operatorUserId ? resolveAutomationStudioContext(state.automationStudioContexts, operatorUserId) : undefined;
  const nativeRuntime = state.instance.programs.automationStudio.nativeRuntimeSummary(state.instance.activeDomainId);
  return {
    runtimeId: state.runtimeId,
    hostRoot: state.instance.paths.root,
    fluxiqDir: state.instance.paths.fluxiq,
    hostModulePath: state.hostModulePath,
    hostModuleLoaded: Boolean(state.hostModulePath),
    clientGatewayPublicUrl: state.clientGatewayServer?.publicUrl ?? process.env.FLUXIQ_PUBLIC_CLIENT_WS_URL ?? null,
    clientGatewayStarted: Boolean(state.clientGatewayServer),
    clientGatewayListening: state.clientGatewayServer?.status.listening ?? false,
    clientGatewayError: state.clientGatewayServer?.status.error ?? null,
    automationStudio: {
      activeProjectId: context?.activeProjectId ?? null,
      updatedAt: context?.updatedAt ?? 0,
      contextCount: Object.keys(state.automationStudioContexts).length,
      nativeImporterRuntimeBound: nativeRuntime.bound,
      nativeNodeDefinitionCount: nativeRuntime.definitionCount,
      recordingMapperCount: nativeRuntime.recordingMapperCount
    }
  };
}

export function setAutomationStudioWebContext(input: { operatorUserId: string; clientId?: string; activeProjectId: string | null }): void {
  const state = getWebRuntimeState();
  setAutomationStudioContext(state.automationStudioContexts, input);
}

export async function reloadFluxIQWebInstance(): Promise<FluxIQ> {
  const state = getWebRuntimeState();
  if (state.clientGatewayServer) await state.clientGatewayServer.close();
  state.instance = createFluxIQWebInstance();
  state.clientGatewayServer = null;
  state.automationStudioContexts = {};
  startSharedClientGateway(state);
  return state.instance;
}

function getWebRuntimeState(): NonNullable<FluxIQWebGlobal["__fluxiqWebRuntime"]> {
  const globalState = globalThis as FluxIQWebGlobal;
  globalState.__fluxiqWebRuntime ??= {
    instance: createFluxIQWebInstance(),
    hostModulePath: resolveFluxIQHostModulePath(),
    clientGatewayServer: null,
    runtimeId: `web.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`,
    automationStudioContexts: {}
  };
  globalState.__fluxiqWebRuntime.automationStudioContexts ??= {};
  globalState.__fluxiqWebRuntime.instance.programs.automationStudioClientGateway.setClientRecordingContextProvider(({ session, request }) => {
    const contexts = globalState.__fluxiqWebRuntime?.automationStudioContexts ?? {};
    const resolved = resolveClientRecordingProject(contexts, {
      ...(session.operatorUserId ? { operatorUserId: session.operatorUserId } : {}),
      clientId: session.clientId,
      ...(request.projectId !== undefined ? { requestedProjectId: request.projectId } : {})
    });
    if (resolved.ok) return resolved;
    return {
      ok: false,
      message: resolved.code === "recording.project_context_mismatch"
        ? "Recording cannot start because the requested project does not match the approving operator's active project."
        : "Recording cannot start because Automation Studio does not have an open project.",
      code: resolved.code,
      metadata: {
        ...(request.projectId ? { requestedProjectId: request.projectId } : {}),
        activeProjectId: resolved.activeProjectId,
        contextUpdatedAt: resolved.contextUpdatedAt
      }
    };
  });
  return globalState.__fluxiqWebRuntime;
}

export function createFluxIQWebInstance(): FluxIQ {
  const rootDir = resolveFluxIQWebHostRoot(process.cwd());
  const fluxiq = applyFluxIQHostModule(FluxIQ.create({ rootDir }));
  if (fluxiq.activeDomainId) return fluxiq;
  if (explicitFluxIQDomainId()) return fluxiq;
  const domains = fluxiq.domains.summaries();
  if (domains.length !== 1) return fluxiq;
  return applyFluxIQHostModule(FluxIQ.create({ rootDir, domainId: domains[0]!.id }));
}

export function applyFluxIQHostModule(fluxiq: FluxIQ): FluxIQ {
  const resolved = resolveFluxIQHostModulePath();
  if (!resolved) return fluxiq;
  const loaded = hostModuleRequire(resolved) as { default?: unknown; registerFluxIQHost?: unknown };
  const register = typeof loaded.registerFluxIQHost === "function"
    ? loaded.registerFluxIQHost as FluxIQHostModuleRegistration
    : typeof loaded.default === "function"
      ? loaded.default as FluxIQHostModuleRegistration
      : null;
  if (!register) {
    throw new Error(`FLUXIQ_HOST_MODULE must export registerFluxIQHost() or a default registration function: ${resolved}`);
  }
  const registered = register(fluxiq);
  const maybePromise = registered as unknown as { then?: unknown };
  if (registered && typeof maybePromise.then === "function") {
    throw new Error(`FLUXIQ_HOST_MODULE registration must be synchronous for the web runtime: ${resolved}`);
  }
  return registered ?? fluxiq;
}

export function resolveFluxIQHostModulePath(): string | null {
  const hostModulePath = process.env.FLUXIQ_HOST_MODULE;
  if (!hostModulePath?.trim()) return null;
  const resolved = path.resolve(hostModulePath.trim());
  if (!existsSync(resolved)) {
    throw new Error(`FLUXIQ_HOST_MODULE points to a missing file: ${resolved}`);
  }
  return resolved;
}

function explicitFluxIQDomainId(): string | null {
  return (process.env.FLUXIQ_DOMAIN_ID || process.env.FLUXIQ_HOST_DOMAIN || "").trim() || null;
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
