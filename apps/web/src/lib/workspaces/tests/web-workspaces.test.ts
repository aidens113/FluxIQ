import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FluxIQ, type FluxIQOptions } from "fluxiq";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeFluxIQWebRuntime, getFluxIQ, getFluxIQWorkspaces, initializeFluxIQWebRuntime } from "../../fluxiq";
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
const globalState = globalThis as typeof globalThis & { __fluxiqWebRuntime?: unknown };
const roots: string[] = [];

afterEach(async () => {
  await closeFluxIQWebRuntime();
  delete globalState.__fluxiqWebRuntime;
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const root of roots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch (error) {
      // The platform's IAM audit store is never closed by the web runtime (it lives as long as the process), so on Windows its file stays locked; the temporary directory is left.
      if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
    }
  }
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
  const user = await fluxiq.programs.identityAccess.upsertUser({ username, displayName: username, roleId: "admin", password: "dummy-password-123" });
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
