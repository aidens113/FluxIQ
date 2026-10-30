import { gatewayServerRuntime } from "../server/gateway-runtime";
import { FluxIQ, fluxiqLayoutV3Paths, removeFluxIQWorkspaceRoot, type FluxIQOptions } from "fluxiq";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveFluxIQDeploymentSettings, resolveFluxIQProfile, type FluxIQDeploymentSettings } from "fluxiq/platform/profile";
import type { ClientGatewayWebSocketServerHandle } from "../server/client-gateway-websocket";
import { drainGateway, drainState } from "../server/drain";
import { createLogger, type Logger } from "../server/log";
import { evaluateReadiness, type Readiness } from "../server/readiness";
import { attachGatewayAuditPersistence } from "../server/security-audit";
import { announceOwnerClaim } from "../server/startup";
import type { ProvisioningListenerHandle } from "../server/provisioning-listener";
import { resolveAutomationStudioContext, resolveClientRecordingProject, setAutomationStudioContext, type AutomationStudioWebContext } from "./automation-studio-context";
import { resolveFluxIQModelProvidersEnabled } from "./model-provider-admission";
import { createTenantFluxIQ, DeferredIamAuditSink, FluxIQWorkspaceManager, initializeFluxIQWebStorage, primaryWorkspaceId, serviceWorkspaceIam, workspaceManagerLimits, workspaceTenancyOfProfile } from "./workspaces";

type FluxIQHostModuleRegistration = (fluxiq: FluxIQ) => FluxIQ | void;

type FluxIQWebGlobal = typeof globalThis & {
  // Held on globalThis because Next.js bundles src/instrumentation.ts, which
  // loads the host, separately from the routes that apply it.
  __fluxiqWebHostModule?: { path: string; register: FluxIQHostModuleRegistration };
  __fluxiqWebRuntime?: {
    /**
     * Every workspace's instance (t813). The primary is the instance this
     * runtime serves, carries the shared WebSocket listener, the audit
     * persistence and the provisioning listener, and is the only one under a
     * single-tenancy profile; `getFluxIQ()` returns it.
     */
    workspaces: FluxIQWorkspaceManager;
    /** Builds the primary instance; a reload builds the next one with it. */
    createPrimary: () => FluxIQ;
    /** The IAM decision audit every registry records into under the service profile, until the platform's own sink opens. */
    iamAudit: DeferredIamAuditSink | null;
    hostModulePath: string | null;
    clientGatewayServer: ClientGatewayWebSocketServerHandle | null;
    /** Set once storage is ready; the readiness probe reads it. */
    initialized?: boolean;
    provisioningListener?: ProvisioningListenerHandle | null;
    provisioningListenerStart?: Promise<void> | null;
    /** The instance whose gateway security events are persisted, and how to stop that. */
    auditedInstance?: FluxIQ | null;
    auditDetach?: (() => void) | null;
    runtimeId: string;
    automationStudioContexts: Record<string, AutomationStudioWebContext>;
    initializationPromise?: Promise<void> | null;
    closePromise?: Promise<void> | null;
    shutdownHandlers?: { sigint: () => void; sigterm: () => void } | null;
  };
};

export function getFluxIQ(): FluxIQ {
  const state = getWebRuntimeState();
  startSharedRuntimeServices(state);
  return primaryOf(state);
}

/**
 * The process's workspace manager: the primary instance, and under the
 * service profile one instance per tenant workspace. Routes and pages reach a
 * caller's workspace through `workspaceFluxIQ` (`./workspaces`), not this.
 */
export function getFluxIQWorkspaces(): FluxIQWorkspaceManager {
  const state = getWebRuntimeState();
  startSharedRuntimeServices(state);
  return state.workspaces;
}

export async function initializeFluxIQWebRuntime(): Promise<FluxIQ> {
  const settings = resolveFluxIQDeploymentSettings(process.env);
  if (settings.gateway.enabled) await gatewayServerRuntime.load();
  await loadFluxIQHostModule();
  const state = getWebRuntimeState();
  await initializeFluxIQWebRuntimeState(state);
  startSharedRuntimeServices(state);
  const logger = createLogger({ format: settings.logFormat });
  await announceOwnerClaim({
    profile: settings.profile,
    publicOrigin: settings.publicOrigin,
    logger,
    prepare: async () => {
      const { prepareOwnerClaim } = await import("../server/owner-claim");
      return prepareOwnerClaim({ settings, fluxiqDir: primaryOf(state).paths.fluxiq });
    }
  });
  await startSharedProvisioningListener(state, settings, logger);
  return primaryOf(state);
}

/** Whether the readiness probe may answer 200; reads the runtime without creating one. */
export function getFluxIQWebReadiness(): Readiness {
  const state = (globalThis as FluxIQWebGlobal).__fluxiqWebRuntime;
  const settings = resolveFluxIQDeploymentSettings(process.env);
  return evaluateReadiness({
    initialized: state?.initialized === true,
    draining: drainState.isDraining(),
    gatewayEnabled: settings.gateway.enabled,
    gatewayListening: state?.clientGatewayServer?.status.listening === true
  });
}

export function getFluxIQWebRuntimeStatus(operatorUserId?: string) {
  const state = getWebRuntimeState();
  const instance = primaryOf(state);
  const settings = resolveFluxIQDeploymentSettings(process.env);
  const context = operatorUserId ? resolveAutomationStudioContext(state.automationStudioContexts, operatorUserId) : undefined;
  const nativeRuntime = instance.programs.automationStudio.nativeRuntimeSummary(instance.activeDomainId);
  const { llmEvidenceRuntime } = instance.programs.automationStudio.getFlowBootstrapGenerationRuntimeReadiness();
  const reusableLlmContext = instance.programs.automationStudio.reusableLlmContextStatus();
  return {
    runtimeId: state.runtimeId,
    // Host paths are not shown to a hosted service's callers.
    ...(settings.profile === "service" ? {} : { hostRoot: instance.paths.root, fluxiqDir: instance.paths.fluxiq }),
    hostModulePath: state.hostModulePath,
    hostModuleLoaded: Boolean(state.hostModulePath),
    clientGatewayPublicUrl: settings.gateway.publicUrl,
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
      llmEvidenceRuntime,
      reusableLlmContext
    }
  };
}

export function setAutomationStudioWebContext(input: { operatorUserId: string; clientId?: string; activeProjectId: string | null; activeFlowId?: string | null }): void {
  const state = getWebRuntimeState();
  setAutomationStudioContext(state.automationStudioContexts, input);
}

/** Replaces the primary instance with a new one built from the current host module; tenant workspaces are left as they are. */
export async function reloadFluxIQWebInstance(): Promise<FluxIQ> {
  resolveFluxIQModelProvidersEnabled();
  // Before anything closes, so a host that fails to load leaves the old runtime serving.
  await loadFluxIQHostModule();
  const state = getWebRuntimeState();
  const gateway = state.clientGatewayServer;
  state.clientGatewayServer = null;
  try {
    if (gateway) await gateway.close();
  } finally {
    await primaryOf(state).close();
  }
  state.workspaces.replacePrimary(state.createPrimary());
  state.initializationPromise = null;
  await initializeFluxIQWebRuntimeState(state);
  state.closePromise = null;
  state.automationStudioContexts = {};
  startSharedRuntimeServices(state);
  return primaryOf(state);
}

async function initializeFluxIQWebRuntimeState(state: WebRuntimeState): Promise<void> {
  state.initializationPromise ??= initializeFluxIQWebStorage(primaryOf(state));
  await state.initializationPromise;
  state.initialized = true;
}

export async function closeFluxIQWebRuntime(): Promise<void> {
  const globalState = globalThis as FluxIQWebGlobal;
  const state = globalState.__fluxiqWebRuntime;
  if (!state) return;
  state.closePromise ??= (async () => {
    // The private listener first: nothing may provision while the rest shuts down.
    const provisioningStart = state.provisioningListenerStart ?? null;
    state.provisioningListenerStart = null;
    try {
      await provisioningStart;
    } catch {
      /* best-effort: a listener that failed to start has nothing to close */
    }
    const provisioningListener = state.provisioningListener ?? null;
    state.provisioningListener = null;
    if (provisioningListener) await provisioningListener.close();
    state.auditDetach?.();
    state.auditDetach = null;
    state.auditedInstance = null;
    const gateway = state.clientGatewayServer;
    state.clientGatewayServer = null;
    try {
      if (gateway) await gateway.close();
    } finally {
      try {
        await flushIamAudit(state);
        // Every workspace, tenants first and the primary last; each tenant's unlocks are revoked.
        await state.workspaces.close();
      } finally {
        removeFluxIQWebShutdownHooks(state);
      }
    }
  })();
  await state.closePromise;
}

function getWebRuntimeState(): WebRuntimeState {
  const globalState = globalThis as FluxIQWebGlobal;
  globalState.__fluxiqWebRuntime ??= createWebRuntimeState();
  globalState.__fluxiqWebRuntime.automationStudioContexts ??= {};
  const primary = primaryOf(globalState.__fluxiqWebRuntime);
  registerFluxIQWebShutdownHooks(globalState.__fluxiqWebRuntime);
  primary.programs.automationStudioClientGateway.setClientRecordingContextProvider(({ session, request }) => {
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

/**
 * The runtime record and its workspace manager. The deployment profile picks
 * the tenancy: `service` is multi-tenant, and every instance (the primary
 * included) then decides by its workspace's IAM policies and records into the
 * platform's audit; `local` and `self-hosted` keep one instance, created
 * exactly as before.
 */
function createWebRuntimeState(): WebRuntimeState {
  const tenancy = workspaceTenancyOfProfile(resolveFluxIQProfile(process.env));
  const primaryId = primaryWorkspaceId();
  const iamAudit = tenancy === "multi"
    ? new DeferredIamAuditSink(async () => (await import("../server/provisioning-listener")).getPlatformIamAuditSink(), {
      onError: (error) => webLogger().warn("[FluxIQ] The IAM audit could not be opened; decisions wait in memory until it opens.", { reason: error.name })
    })
    : null;
  const iamOf = (workspaceId: string): Pick<FluxIQOptions, "iam"> => iamAudit
    ? { iam: serviceWorkspaceIam(workspaceId, { platformServices: async () => (await import("../server/provisioning-listener")).getPlatformServices(), audit: iamAudit }) }
    : {};
  const createPrimary = () => createFluxIQWebInstance(iamOf(primaryId));
  const workspaces = new FluxIQWorkspaceManager({
    tenancy,
    primaryWorkspaceId: primaryId,
    createPrimary,
    ...(tenancy === "multi" ? {
      createTenant: ({ workspaceId, heldKeys, primary }) => createTenantFluxIQ({ workspaceId, heldKeys, dataRoot: primary.paths.root, ...iamOf(workspaceId), instantiate: createTenantFluxIQInstance }),
      removeTenantRoot: async ({ workspaceId, primary }) => {
        await removeFluxIQWorkspaceRoot(fluxiqLayoutV3Paths(primary.paths.root), workspaceId);
      }
    } : {}),
    ...workspaceManagerLimits(process.env),
    warn: (message, fields) => webLogger().warn(message, fields)
  });
  return {
    workspaces,
    createPrimary,
    iamAudit,
    hostModulePath: resolveFluxIQHostModulePath(),
    clientGatewayServer: null,
    runtimeId: `web.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`,
    automationStudioContexts: {}
  };
}

export function createFluxIQWebInstance(options: Pick<FluxIQOptions, "iam"> = {}): FluxIQ {
  const modelProvidersEnabled = resolveFluxIQModelProvidersEnabled();
  const rootDir = resolveFluxIQWebHostRoot(process.cwd());
  const extra = options.iam ? { iam: options.iam } : {};
  const fluxiq = applyFluxIQHostModule(FluxIQ.create({ rootDir, modelProvidersEnabled, ...extra }));
  const domainId = soleHostDomainId(fluxiq);
  if (!domainId) return fluxiq;
  return applyFluxIQHostModule(FluxIQ.create({ rootDir, domainId, modelProvidersEnabled, ...extra }));
}

/**
 * A tenant workspace's instance, built as the primary is (the host module
 * applied, the one host domain picked when no domain is named), on the options
 * the manager gives. The instance built to read the host's domains is closed
 * before the one that keeps the domain is built on the same root.
 */
async function createTenantFluxIQInstance(options: FluxIQOptions): Promise<FluxIQ> {
  const modelProvidersEnabled = resolveFluxIQModelProvidersEnabled();
  const first = await withHostModule(FluxIQ.create({ ...options, modelProvidersEnabled }));
  const domainId = soleHostDomainId(first);
  if (!domainId) return first;
  await first.close({ mode: "evict" });
  return await withHostModule(FluxIQ.create({ ...options, domainId, modelProvidersEnabled }));
}

/** Applies the host module; an instance the host refused is closed rather than left attached to the process. */
async function withHostModule(fluxiq: FluxIQ): Promise<FluxIQ> {
  try {
    return applyFluxIQHostModule(fluxiq);
  } catch (error) {
    await fluxiq.close({ mode: "evict" });
    throw error;
  }
}

/** The host's one registered domain, when the instance has none active and none is named in the environment. */
function soleHostDomainId(fluxiq: FluxIQ): string | null {
  if (fluxiq.activeDomainId) return null;
  if (explicitFluxIQDomainId()) return null;
  const domains = fluxiq.domains.summaries();
  return domains.length === 1 ? domains[0]!.id : null;
}

function primaryOf(state: WebRuntimeState): FluxIQ {
  return state.workspaces.primary().fluxiq;
}

/** Writes the IAM decisions still held; a failure is reported, never allowed to stop the shutdown. */
async function flushIamAudit(state: WebRuntimeState): Promise<void> {
  try {
    await state.iamAudit?.flush();
  } catch (error) {
    webLogger().warn("[FluxIQ] The IAM audit could not be written before shutdown.", { reason: error instanceof Error ? error.name : "unknown" });
  }
}

/** A logger for the runtime's own lines; a bad log setting falls back to text rather than failing the line. */
function webLogger(): Logger {
  try {
    return createLogger({ format: resolveFluxIQDeploymentSettings(process.env).logFormat });
  } catch (error) {
    const fallback = createLogger({ format: "text" });
    fallback.warn("[FluxIQ] The deployment settings could not be read for the log format.", { reason: error instanceof Error ? error.name : "unknown" });
    return fallback;
  }
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

type WebRuntimeState = NonNullable<FluxIQWebGlobal["__fluxiqWebRuntime"]>;

function startSharedRuntimeServices(state: WebRuntimeState): void {
  const settings = resolveFluxIQDeploymentSettings(process.env);
  const logger = createLogger({ format: settings.logFormat });
  startSharedClientGateway(state, settings, logger);
  persistGatewaySecurityEvents(state, settings, logger);
}

function startSharedClientGateway(state: WebRuntimeState, settings: FluxIQDeploymentSettings, logger: Logger): void {
  if (state.clientGatewayServer || !settings.gateway.enabled) return;
  const { gateway } = settings;
  process.env.FLUXIQ_PUBLIC_CLIENT_WS_URL ??= gateway.publicUrl; // programs/_shared/runtime.ts still reads it.
  const { startClientGatewayWebSocketServer } = gatewayServerRuntime.read();
  const instance = primaryOf(state);
  instance.programs.clientGateway.bindTransportBuildIdentity(); // Legacy replacement clears active provenance, never its anchor.
  state.clientGatewayServer = startClientGatewayWebSocketServer({
    gateway: instance.programs.clientGateway,
    host: gateway.host,
    port: gateway.port,
    path: gateway.path,
    publicUrl: gateway.publicUrl,
    profile: settings.profile,
    trustProxy: settings.trustProxy,
    limits: gateway.limits,
    ...(gateway.allowedOrigins ? { allowedOrigins: gateway.allowedOrigins } : {})
  });
  logger.info(`[FluxIQ] Client gateway WebSocket bound to shared runtime ${state.runtimeId} at ${state.clientGatewayServer.publicUrl}`);
}

/** Outside the local profile, gateway security events outlive the in-memory audit ring. */
function persistGatewaySecurityEvents(state: WebRuntimeState, settings: FluxIQDeploymentSettings, logger: Logger): void {
  const instance = primaryOf(state);
  if (settings.profile === "local" || state.auditedInstance === instance) return;
  const gateway = instance.programs.clientGateway;
  state.auditDetach?.();
  state.auditedInstance = instance;
  state.auditDetach = attachGatewayAuditPersistence(gateway, {
    fluxiqDir: instance.paths.fluxiq,
    onWriteError: (reason) => logger.warn("[FluxIQ] The gateway security audit could not be written.", { reason })
  });
}

/** The private listener runs on the service profile only; the barrel is imported late because it imports this module. */
async function startSharedProvisioningListener(state: WebRuntimeState, settings: FluxIQDeploymentSettings, logger: Logger): Promise<void> {
  if (settings.profile !== "service") return;
  state.provisioningListenerStart ??= (async () => {
    const { getPlatformServices, startProvisioningListenerForProfile } = await import("../server/provisioning-listener");
    state.provisioningListener = await startProvisioningListenerForProfile(settings, process.env, getPlatformServices, (line) => logger.info(line));
    if (state.provisioningListener) logger.info(`[FluxIQ] Provisioning listener on ${state.provisioningListener.address.host}:${state.provisioningListener.address.port}`);
  })().catch((error: unknown) => {
    state.provisioningListenerStart = null;
    throw error;
  });
  await state.provisioningListenerStart;
}

function registerFluxIQWebShutdownHooks(state: NonNullable<FluxIQWebGlobal["__fluxiqWebRuntime"]>): void {
  if (state.shutdownHandlers) return;
  const shutdown = (exitCode: number) => {
    void closeFluxIQWebRuntime().finally(() => process.exit(exitCode));
  };
  const sigint = () => shutdown(130);
  const sigterm = () => {
    const drainSeconds = resolveDrainSeconds();
    if (drainSeconds <= 0) return shutdown(143);
    const logger = createLogger({ format: resolveFluxIQDeploymentSettings(process.env).logFormat });
    logger.info(`[FluxIQ] Draining for up to ${drainSeconds} s before shutdown`);
    void drainGateway({ gateway: state.clientGatewayServer, drainSeconds })
      .then((drained) => logger.info(drained ? "[FluxIQ] Drain finished: no connections left" : "[FluxIQ] Drain time is up: closing with connections open"))
      .catch((error: unknown) => logger.warn("[FluxIQ] The drain failed; closing now", { reason: error instanceof Error ? error.name : "unknown" }))
      .finally(() => shutdown(143));
  };
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

/** A bad deployment setting must not block a shutdown, so it falls back to closing at once. */
function resolveDrainSeconds(): number {
  try {
    return resolveFluxIQDeploymentSettings(process.env).drainSeconds;
  } catch {
    return 0;
  }
}
