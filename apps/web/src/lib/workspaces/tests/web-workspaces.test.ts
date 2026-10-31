import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FluxIQ, type FluxIQOptions } from "fluxiq";
import { IamAuditStore } from "fluxiq/platform";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeFluxIQWebRuntime, getFluxIQ, getFluxIQWorkspaces, initializeFluxIQWebRuntime, reloadFluxIQWebInstance } from "../../fluxiq";
import { FLUXIQ_SESSION_COOKIE } from "../../session-cookie";
import { workspaceManagerLimits } from "../manager-limits";
import { sessionIdOf } from "../session-id-of";
import { workspaceFluxIQ } from "../workspace-fluxiq";

// The web runtime's manager as routes and pages reach it: one entry, created
// as before, under a single-tenancy profile; under `service`, IAM on every
// instance and a signed-in person routed to their workspace's own instance.

const ownerClaim = vi.hoisted(() => ({ prepare: vi.fn(async (_input: unknown) => ({ claimed: false, codeFile: "/setup-code-file" })) }));
vi.mock("../../../server/owner-claim", () => ({ prepareOwnerClaim: ownerClaim.prepare }));

const ENV_KEYS = [
  "FLUXIQ_IMPORTER_ROOT", "FLUXIQ_CLIENT_GATEWAY_ENABLED", "FLUXIQ_PROFILE", "FLUXIQ_PUBLIC_ORIGIN", "FLUXIQ_PROVISIONING_LISTEN",
  "FLUXIQ_PROVISIONING_TOKEN_FILE", "FLUXIQ_WORKSPACE_ID", "FLUXIQ_HOST_MODULE", "FLUXIQ_DOMAIN_ID", "FLUXIQ_HOST_DOMAIN"
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const globalState = globalThis as typeof globalThis & { __fluxiqWebRuntime?: unknown; __fluxiqWebHostModule?: unknown };
const roots: string[] = [];

afterEach(async () => {
  await closeFluxIQWebRuntime();
  delete globalState.__fluxiqWebRuntime;
  delete globalState.__fluxiqWebHostModule;
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runtimeEnv(profile: string | undefined, extra: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-web-workspaces-"));
  roots.push(root);
  process.env.FLUXIQ_IMPORTER_ROOT = root;
  process.env.FLUXIQ_CLIENT_GATEWAY_ENABLED = "false";
  process.env.FLUXIQ_PUBLIC_ORIGIN = "https://panel.example.test";
  process.env.FLUXIQ_PROVISIONING_LISTEN = "";
  process.env.FLUXIQ_PROVISIONING_TOKEN_FILE = "";
  for (const key of ["FLUXIQ_HOST_MODULE", "FLUXIQ_DOMAIN_ID", "FLUXIQ_HOST_DOMAIN", "FLUXIQ_WORKSPACE_ID"] as const) delete process.env[key];
  if (profile === undefined) delete process.env.FLUXIQ_PROFILE;
  else process.env.FLUXIQ_PROFILE = profile;
  for (const [key, value] of Object.entries(extra)) process.env[key] = value;
  delete globalState.__fluxiqWebRuntime;
  return root;
}

async function signIn(fluxiq: FluxIQ, username: string): Promise<{ userId: string; sessionId: string }> {
  // This file proves session routing, not password verification or key release.
  const user = await fluxiq.programs.identityAccess.upsertUser({ username, displayName: username, roleId: "admin" });
  const session = await fluxiq.programs.identityAccess.createSession(user.id);
  return { userId: user.id, sessionId: session.id };
}

function requestWith(sessionId: string): Request {
  return new Request("https://panel.example.test/api/probe", { headers: { cookie: `other=1; ${FLUXIQ_SESSION_COOKIE}=${sessionId}` } });
}

describe("the web runtime's workspaces", () => {
  it.each([undefined, "local", "self-hosted"])("under profile %j holds exactly one workspace, created as before", async (profile) => {
    runtimeEnv(profile);
    const create = vi.spyOn(FluxIQ, "create");
    const fluxiq = await initializeFluxIQWebRuntime();
    const manager = getFluxIQWorkspaces();
    expect(manager.tenancy).toBe("single");
    expect(manager.workspaceIds()).toEqual(["workspace-main"]);
    expect(manager.primary().fluxiq).toBe(fluxiq);
    expect(getFluxIQ()).toBe(fluxiq);
    expect(manager.primary().heldKeys).toBeNull();
    // As before: the importer root and the provider admission, nothing else.
    expect(create.mock.calls.map(([options]) => Object.keys(options ?? {}).sort())).toEqual([["modelProvidersEnabled", "rootDir"]]);

    const person = await signIn(fluxiq, "single-owner");
    const lease = await workspaceFluxIQ(requestWith(person.sessionId));
    expect(lease).toMatchObject({ workspaceId: "workspace-main" });
    expect(lease!.fluxiq).toBe(fluxiq);
    lease!.release();
    await expect(manager.acquire("ws-other")).rejects.toThrow("workspaces.unknown_workspace");
    expect(manager.workspaceIds()).toEqual(["workspace-main"]);
  });

  it("answers null for a request with no session or a session that is not live", async () => {
    runtimeEnv("local");
    await initializeFluxIQWebRuntime();
    expect(await workspaceFluxIQ(new Request("https://panel.example.test/"))).toBeNull();
    expect(await workspaceFluxIQ({ cookies: { get: () => undefined } })).toBeNull();
    expect(await workspaceFluxIQ(requestWith("not-a-session"))).toBeNull();
  });

  it("names the primary workspace from FLUXIQ_WORKSPACE_ID", async () => {
    runtimeEnv("local", { FLUXIQ_WORKSPACE_ID: "workspace-acme" });
    const fluxiq = await initializeFluxIQWebRuntime();
    const person = await signIn(fluxiq, "acme-owner");
    const lease = await workspaceFluxIQ({ cookies: { get: (name: string) => (name === FLUXIQ_SESSION_COOKIE ? { value: person.sessionId } : undefined) } });
    expect(lease?.workspaceId).toBe("workspace-acme");
    lease?.release();
  });

  it("under service gives every instance its workspace's IAM and routes a person to their workspace's own instance", async () => {
    const root = runtimeEnv("service");
    const create = vi.spyOn(FluxIQ, "create");
    const primary = await initializeFluxIQWebRuntime();
    const manager = getFluxIQWorkspaces();
    expect(manager.tenancy).toBe("multi");
    const primaryOptions = create.mock.calls[0]![0] as FluxIQOptions;
    expect(primaryOptions.iam).toMatchObject({ profile: "service", workspaceId: "workspace-main" });
    expect(primaryOptions.iam?.source).toBeDefined();
    expect(primaryOptions.iam?.audit).toBeDefined();
    expect(primaryOptions.heldKeys).toBeUndefined();

    // Provisioning is single-tenancy today, so this person's membership in another workspace is written by hand.
    const person = await signIn(primary, "tenant-member");
    const { getPlatformServices } = await import("../../../server/provisioning-listener");
    const services = await getPlatformServices();
    const now = Date.now();
    await services.store.putMembership({ workspaceId: "ws-tenant", userId: person.userId, policies: [], groups: [], status: "active", createdAtMs: now, updatedAtMs: now });

    const lease = await workspaceFluxIQ(requestWith(person.sessionId));
    expect(lease?.workspaceId).toBe("ws-tenant");
    expect(lease!.fluxiq).not.toBe(primary);
    expect(lease!.fluxiq.paths.root).toBe(path.join(root, "workspaces", "ws-tenant"));
    expect(lease!.fluxiq.inspectStorage().layout).toBe("v2");
    const tenantOptions = create.mock.calls.at(-1)![0] as FluxIQOptions;
    expect(tenantOptions).toMatchObject({ loadEnv: false, iam: { profile: "service", workspaceId: "ws-tenant" } });
    expect(tenantOptions.heldKeys).toBe(manager.get("ws-tenant")?.heldKeys);
    // The lazy policy source reaches the platform's IAM store for that workspace.
    await expect(tenantOptions.iam!.source!.getRole("FluxIQNoSuchRole")).resolves.toBeNull();
    expect(tenantOptions.iam!.audit).toBe(primaryOptions.iam!.audit);
    lease!.release();
    expect(manager.workspaceIds()).toEqual(["workspace-main", "ws-tenant"]);

    // One shutdown closes every workspace for good: the tenant's custody is revoked, the primary closes last.
    const tenantClose = vi.spyOn(lease!.fluxiq, "close");
    const primaryClose = vi.spyOn(primary, "close");
    const revokeAll = vi.spyOn(manager.get("ws-tenant")!.heldKeys!, "revokeAll");
    await closeFluxIQWebRuntime();
    expect(tenantClose).toHaveBeenCalledWith({ mode: "shutdown" });
    expect(revokeAll).toHaveBeenCalled();
    expect(primaryClose).toHaveBeenCalledTimes(1);
    expect(tenantClose.mock.invocationCallOrder[0]!).toBeLessThan(primaryClose.mock.invocationCallOrder[0]!);
  }, 60_000);

  it("reuses one root-owned audit across reloads and closes it on shutdown", async () => {
    runtimeEnv("service");
    const opened = vi.spyOn(IamAuditStore, "open");
    const primary = await initializeFluxIQWebRuntime();
    const { getPlatformServices, getPlatformIamAuditSink } = await import("../../../server/provisioning-listener");
    const before = await getPlatformServices();
    const sink = await getPlatformIamAuditSink();
    // Instrumentation and routes can evaluate separate copies of this module.
    const anotherBundle = await vi.importActual<Pick<typeof import("../../../server/provisioning-listener"), "getPlatformServices" | "getPlatformIamAuditSink">>("../../../server/provisioning-listener/platform-services?isolated-owner");
    expect(anotherBundle.getPlatformServices).not.toBe(getPlatformServices);
    expect(await anotherBundle.getPlatformServices()).toBe(before);
    expect(await anotherBundle.getPlatformIamAuditSink()).toBe(sink);
    const store = await opened.mock.results[0]!.value as IamAuditStore;
    const closed = vi.spyOn(store, "close");
    const record = (requestId: string) => sink.record({ category: "allow", time: 0, requestId, principal: "user/example", action: "studio:Projects", resources: [], decision: "allow", matched: "implicit", origin: "panel", ipPrefix: null });
    record("before");
    let finishClose!: () => void;
    const gate = new Promise<void>((resolve) => { finishClose = resolve; });
    const close = primary.close.bind(primary);
    const closingPrimary = vi.spyOn(primary, "close").mockImplementation(async (options) => {
      await gate;
      await close(options);
    });
    const reloading = reloadFluxIQWebInstance();
    await vi.waitFor(() => expect(closingPrimary).toHaveBeenCalledTimes(1));
    let composed = false;
    const duringReload = getPlatformServices().then((services) => {
      composed = true;
      return services;
    });
    try {
      await new Promise((resolve) => setImmediate(resolve));
      expect(composed).toBe(false);
    } finally {
      finishClose();
    }
    await reloading;
    expect(await duringReload).not.toBe(before);
    expect(await getPlatformIamAuditSink()).toBe(sink);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();
    record("after");
    await sink.flush();
    expect((await store.read()).map((row) => row.requestId)).toEqual(expect.arrayContaining(["before", "after"]));
    await closeFluxIQWebRuntime();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("selects the oldest active membership, then workspace id, independently of store order", async () => {
    runtimeEnv("service");
    const primary = await initializeFluxIQWebRuntime();
    const person = await signIn(primary, "many-workspaces");
    const { getPlatformServices } = await import("../../../server/provisioning-listener");
    const { store } = await getPlatformServices();
    for (const [workspaceId, createdAtMs, status] of [["ws-new", 20, "active"], ["ws-old-z", 10, "active"], ["ws-removed", 0, "removed"], ["ws-old-a", 10, "active"]] as const) {
      await store.putMembership({ workspaceId, userId: person.userId, policies: [], groups: [], status, createdAtMs, updatedAtMs: createdAtMs });
    }
    const lease = await workspaceFluxIQ(requestWith(person.sessionId));
    expect(lease?.workspaceId).toBe("ws-old-a");
    lease?.release();
  });

  it("flushes a cold registry audit during shutdown without constructing platform identity services", async () => {
    runtimeEnv("service");
    const create = vi.spyOn(FluxIQ, "create");
    const platform = await import("fluxiq/platform");
    const compose = vi.spyOn(platform, "createPlatformServices");
    const opened = vi.spyOn(IamAuditStore, "open");
    await initializeFluxIQWebRuntime();
    const audit = (create.mock.calls[0]![0] as FluxIQOptions).iam!.audit!;
    audit.record({ category: "allow", time: 0, requestId: "cold", principal: "user/example", action: "studio:Projects", resources: [], decision: "allow", matched: "implicit", origin: "panel", ipPrefix: null });
    await closeFluxIQWebRuntime();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(compose).not.toHaveBeenCalled();
    // afterEach removes this root without tolerating locked SQLite files.
  });

  it("fully closes the domain probe before the primary opens the same storage root", async () => {
    const root = runtimeEnv("local");
    const hostPath = path.join(root, "host.cjs");
    writeFileSync(hostPath, "module.exports.registerFluxIQHost = (fluxiq) => { fluxiq.registerDomain({ manifest: { id: 'example.domain', title: 'Example', category: 'Tests', description: 'Test host', icon: 'blocks' } }); };\n");
    process.env.FLUXIQ_HOST_MODULE = hostPath;
    const originalCreate = FluxIQ.create.bind(FluxIQ);
    const order: string[] = [];
    let finishClose!: () => void;
    const gate = new Promise<void>((resolve) => { finishClose = resolve; });
    const create = vi.spyOn(FluxIQ, "create").mockImplementation((options) => {
      const instance = originalCreate(options);
      order.push(options?.domainId ? "primary" : "probe");
      if (!options?.domainId) {
        const close = instance.close.bind(instance);
        vi.spyOn(instance, "close").mockImplementation(async (closeOptions) => {
          await gate;
          await close(closeOptions);
          order.push("probe closed");
        });
      }
      return instance;
    });
    const starting = initializeFluxIQWebRuntime();
    try {
      await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(order).toEqual(["probe"]);
    } finally {
      finishClose();
    }
    const primary = await starting;
    expect(order).toEqual(["probe", "probe closed", "primary"]);
    const person = await signIn(primary, "probe-owner");
    await new Promise((resolve) => setImmediate(resolve));
    expect(await primary.programs.identityAccess.validateSession(person.sessionId)).not.toBeNull();
    expect(order).toEqual(["probe", "probe closed", "primary"]);
  });

  it("shares concurrent reloads and cannot replace the primary after shutdown starts", async () => {
    runtimeEnv("local");
    const create = vi.spyOn(FluxIQ, "create");
    await initializeFluxIQWebRuntime();
    const [first, second] = await Promise.all([reloadFluxIQWebInstance(), reloadFluxIQWebInstance()]);
    expect(first).toBe(second);
    expect(create).toHaveBeenCalledTimes(2);
    let finishClose!: () => void;
    const gate = new Promise<void>((resolve) => { finishClose = resolve; });
    const close = first.close.bind(first);
    const closingPrimary = vi.spyOn(first, "close").mockImplementation(async (options) => {
      await gate;
      await close(options);
    });
    const reloading = reloadFluxIQWebInstance();
    const refused = expect(reloading).rejects.toThrow("workspaces.closed");
    await vi.waitFor(() => expect(closingPrimary).toHaveBeenCalledTimes(1));
    const closing = closeFluxIQWebRuntime();
    finishClose();
    await Promise.all([refused, closing]);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("cannot miss a primary still being prepared when shutdown starts", async () => {
    const root = runtimeEnv("local");
    const hostPath = path.join(root, "preparing-host.cjs");
    writeFileSync(hostPath, "module.exports.registerFluxIQHost = () => {};\n");
    process.env.FLUXIQ_HOST_MODULE = hostPath;
    const originalCreate = FluxIQ.create.bind(FluxIQ);
    let finishProbe!: () => void;
    const gate = new Promise<void>((resolve) => { finishProbe = resolve; });
    const instances: FluxIQ[] = [];
    vi.spyOn(FluxIQ, "create").mockImplementation((options) => {
      const instance = originalCreate(options);
      if (instances.length === 0) {
        const close = instance.close.bind(instance);
        vi.spyOn(instance, "close").mockImplementation(async (closeOptions) => {
          await gate;
          await close(closeOptions);
        });
      } else vi.spyOn(instance, "close");
      instances.push(instance);
      return instance;
    });
    const starting = initializeFluxIQWebRuntime();
    const refused = expect(starting).rejects.toThrow("workspaces.closed");
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    const closing = closeFluxIQWebRuntime();
    finishProbe();
    await Promise.all([refused, closing]);
    expect(instances).toHaveLength(2);
    expect(instances[1]!.close).toHaveBeenCalled();
    expect(() => getFluxIQ()).toThrow("workspaces.closed");
  });

  it("refuses a root-changing reload before closing the primary or redirecting tenant storage", async () => {
    const root = runtimeEnv("service");
    const primary = await initializeFluxIQWebRuntime();
    const manager = getFluxIQWorkspaces();
    const tenant = await manager.acquire("ws-a");
    tenant.release();
    const otherRoot = mkdtempSync(path.join(os.tmpdir(), "fluxiq-other-host-"));
    roots.push(otherRoot);
    const close = vi.spyOn(primary, "close");
    process.env.FLUXIQ_IMPORTER_ROOT = otherRoot;
    await expect(reloadFluxIQWebInstance()).rejects.toThrow("workspaces.root_changed");
    expect(close).not.toHaveBeenCalled();
    expect(getFluxIQ()).toBe(primary);
    expect(manager.get("ws-a")?.fluxiq.paths.root).toBe(path.join(root, "workspaces", "ws-a"));
  });

  it("still reports a resource-close failure after finishing runtime cleanup", async () => {
    runtimeEnv("local");
    const primary = await initializeFluxIQWebRuntime();
    const close = primary.close.bind(primary);
    vi.spyOn(primary, "close").mockRejectedValue(new Error("workspace close failed"));
    try {
      await expect(closeFluxIQWebRuntime()).rejects.toThrow("workspace close failed");
    } finally {
      await close();
      delete globalState.__fluxiqWebRuntime;
    }
  });
});

describe("workspace request helpers", () => {
  it("reads the session from parsed cookies first, else from the cookie header", () => {
    expect(sessionIdOf({ cookies: { get: (name) => (name === "s" ? { value: "from-cookies" } : undefined) }, headers: { get: () => "s=from-header" } }, "s")).toBe("from-cookies");
    expect(sessionIdOf({ headers: { get: () => "a=1; s=from-header; b=2" } }, "s")).toBe("from-header");
    expect(sessionIdOf({ headers: { get: () => "as=1; s=" } }, "s")).toBeNull();
    expect(sessionIdOf({}, "s")).toBeNull();
  });

  it("reads the manager's bounds from the environment and refuses a value that is not a positive whole number", () => {
    expect(workspaceManagerLimits({})).toEqual({});
    expect(workspaceManagerLimits({ FLUXIQ_WORKSPACE_IDLE_MS: "120000", FLUXIQ_WORKSPACE_CACHE_MAX: "5" })).toEqual({ idleMs: 120_000, cacheMax: 5 });
    for (const bad of ["0", "-1", "1.5", "ten", "1e3"]) {
      expect(() => workspaceManagerLimits({ FLUXIQ_WORKSPACE_CACHE_MAX: bad }), bad).toThrow("FLUXIQ_WORKSPACE_CACHE_MAX must be a positive whole number");
    }
  });
});
