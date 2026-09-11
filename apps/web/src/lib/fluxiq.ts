import { FluxIQ } from "fluxiq";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseAllowedOrigins, startClientGatewayWebSocketServer, type ClientGatewayWebSocketServerHandle } from "../server/client-gateway-websocket";
import { resolveAutomationStudioContext, resolveClientRecordingProject, setAutomationStudioContext, type AutomationStudioWebContext } from "./automation-studio-context";

type FluxIQHostModuleRegistration = (fluxiq: FluxIQ) => FluxIQ | void;

type FluxIQWebGlobal = typeof globalThis & {
  // Held on globalThis because Next.js bundles src/instrumentation.ts, which
  // loads the host, separately from the routes that apply it.
  __fluxiqWebHostModule?: { path: string; register: FluxIQHostModuleRegistration };
  __fluxiqWebRuntime?: {
    instance: FluxIQ;
    hostModulePath: string | null;
    clientGatewayServer: ClientGatewayWebSocketServerHandle | null;
    runtimeId: string;
    automationStudioContexts: Record<string, AutomationStudioWebContext>;
    closePromise?: Promise<void> | null;
    shutdownHandlers?: { sigint: () => void; sigterm: () => void } | null;
  };
};

export function getFluxIQ(): FluxIQ {
  const state = getWebRuntimeState();
  startSharedClientGateway(state);
  return state.instance;
}

export function getFluxIQWebRuntimeStatus(operatorUserId?: string) {
  const state = getWebRuntimeState();
  const context = operatorUserId ? resolveAutomationStudioContext(state.automationStudioContexts, operatorUserId) : undefined;
  const nativeRuntime = state.instance.programs.automationStudio.nativeRuntimeSummary(state.instance.activeDomainId);
  const reusableLlmContext = state.instance.programs.automationStudio.reusableLlmContextStatus();
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
      activeFlowId: context?.activeFlowId ?? null,
      updatedAt: context?.updatedAt ?? 0,
      contextCount: Object.keys(state.automationStudioContexts).length,
      nativeImporterRuntimeBound: nativeRuntime.bound,
      nativeNodeDefinitionCount: nativeRuntime.definitionCount,
      recordingMapperCount: nativeRuntime.recordingMapperCount,
      reusableLlmContext
    }
  };
}

export function setAutomationStudioWebContext(input: { operatorUserId: string; clientId?: string; activeProjectId: string | null; activeFlowId?: string | null }): void {
  const state = getWebRuntimeState();
  setAutomationStudioContext(state.automationStudioContexts, input);
}

export async function reloadFluxIQWebInstance(): Promise<FluxIQ> {
  // Before anything closes, so a host that fails to load leaves the old runtime serving.
  await loadFluxIQHostModule();
  const state = getWebRuntimeState();
  const gateway = state.clientGatewayServer;
  state.clientGatewayServer = null;
  try {
    if (gateway) await gateway.close();
  } finally {
    await state.instance.close();
  }
  state.instance = createFluxIQWebInstance();
  state.closePromise = null;
  state.automationStudioContexts = {};
  startSharedClientGateway(state);
  return state.instance;
}

export async function closeFluxIQWebRuntime(): Promise<void> {
  const globalState = globalThis as FluxIQWebGlobal;
  const state = globalState.__fluxiqWebRuntime;
  if (!state) return;
  state.closePromise ??= (async () => {
    const gateway = state.clientGatewayServer;
    state.clientGatewayServer = null;
    try {
      if (gateway) await gateway.close();
    } finally {
      try {
        await state.instance.close();
      } finally {
        removeFluxIQWebShutdownHooks(state);
      }
    }
  })();
  await state.closePromise;
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
  registerFluxIQWebShutdownHooks(globalState.__fluxiqWebRuntime);
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

/**
 * Loads FLUXIQ_HOST_MODULE with a native dynamic import(). FluxIQ packages are
 * ESM-only and export only the `import` condition, so a host reaches public
 * subpaths such as `fluxiq/automation-studio` only as an ES module; require()
 * cannot resolve them. import() also still loads a CommonJS host that needs no
 * FluxIQ runtime import. Registration stays synchronous, so the web server
 * awaits this once at startup (src/instrumentation.ts) before creating the runtime.
 */
export async function loadFluxIQHostModule(): Promise<string | null> {
  const resolved = resolveFluxIQHostModulePath();
  if (!resolved) return null;
  const globalState = globalThis as FluxIQWebGlobal;
  if (globalState.__fluxiqWebHostModule?.path === resolved) return resolved;
  const register = fluxIQHostModuleRegistration(await importFluxIQHostModule(resolved));
  if (!register) {
    throw new Error(`FLUXIQ_HOST_MODULE must export registerFluxIQHost() or a default registration function: ${resolved}`);
  }
  globalState.__fluxiqWebHostModule = { path: resolved, register };
  return resolved;
}

export function applyFluxIQHostModule(fluxiq: FluxIQ): FluxIQ {
  const resolved = resolveFluxIQHostModulePath();
  if (!resolved) return fluxiq;
  const loaded = (globalThis as FluxIQWebGlobal).__fluxiqWebHostModule;
  if (!loaded || loaded.path !== resolved) {
    throw new Error(`FLUXIQ_HOST_MODULE has not been loaded; await loadFluxIQHostModule() before creating the web runtime: ${resolved}`);
  }
  const registered = loaded.register(fluxiq);
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

async function importFluxIQHostModule(modulePath: string): Promise<Record<string, unknown>> {
  try {
    // The host path is known only at runtime, so Next.js must leave this a
    // native import() rather than bundle it; @vite-ignore quiets Vite in tests.
    return await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ pathToFileURL(modulePath).href) as Record<string, unknown>;
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") {
      throw new Error(`FLUXIQ_HOST_MODULE could not resolve a package export. FluxIQ packages are ESM-only, so a host that imports them must be an ES module (.mjs, or .js under "type": "module"): ${modulePath}`, { cause: error });
    }
    throw error;
  }
}

function fluxIQHostModuleRegistration(namespace: Record<string, unknown>): FluxIQHostModuleRegistration | null {
  // import() of a CommonJS host exposes module.exports as the default export.
  const commonJsExports = typeof namespace.default === "object" && namespace.default !== null
    ? namespace.default as Record<string, unknown>
    : {};
  const register = [namespace.registerFluxIQHost, commonJsExports.registerFluxIQHost, namespace.default, commonJsExports.default]
    .find((candidate) => typeof candidate === "function");
  return (register as FluxIQHostModuleRegistration | undefined) ?? null;
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

function registerFluxIQWebShutdownHooks(state: NonNullable<FluxIQWebGlobal["__fluxiqWebRuntime"]>): void {
  if (state.shutdownHandlers) return;
  const shutdown = (exitCode: number) => {
    void closeFluxIQWebRuntime().finally(() => process.exit(exitCode));
  };
  const sigint = () => shutdown(130);
  const sigterm = () => shutdown(143);
  state.shutdownHandlers = { sigint, sigterm };
  process.once("SIGINT", sigint);
  process.once("SIGTERM", sigterm);
}

function removeFluxIQWebShutdownHooks(state: NonNullable<FluxIQWebGlobal["__fluxiqWebRuntime"]>): void {
  const handlers = state.shutdownHandlers;
  if (!handlers) return;
  process.off("SIGINT", handlers.sigint);
  process.off("SIGTERM", handlers.sigterm);
  state.shutdownHandlers = null;
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
