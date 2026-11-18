import { MemoryPlatformStore, type PlatformAccountRecord, type PlatformMembershipRecord } from "fluxiq/platform";
import { vi } from "vitest";
import { registry, resetRouteRuntime, routeRequest, runtime } from "../../routes/tests/route-runtime";
import type { WorkspaceRouteCaller, WorkspaceRouteContext } from "../../routes";
import { WorkspaceAccountReadOwner } from "../owner";

export { registry, routeRequest };

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const manager = {
  tenancy: "multi",
  primaryWorkspaceId: "workspace-main",
  primary: (): { workspaceId: string; fluxiq: typeof runtime.primary } => ({ workspaceId: "workspace-main", fluxiq: readRuntime.primary }),
  get: vi.fn(),
  acquire: vi.fn()
};

export const readRuntime = {
  base: runtime,
  manager,
  primary: runtime.primary,
  current: true,
  store: new MemoryPlatformStore(),
  instances: new Map<string, typeof runtime.primary>(),
  auditRead: vi.fn(),
  auditFactory: vi.fn(),
  storeFactory: vi.fn(),
  legacyServices: vi.fn(),
  afterReload: vi.fn()
};

export function account(userId: string, fields: Partial<PlatformAccountRecord> = {}): PlatformAccountRecord {
  return {
    userId, email: `${userId}@example.test`, emailVerifiedAtMs: 1, displayName: userId,
    externalId: `private-external-${userId}`, identities: [{ provider: "password", subject: `${userId}@example.test` }],
    status: "active", disabledReason: null, createdVia: "in-process", termsVersion: "private-terms",
    createdAtMs: 1, updatedAtMs: 1, lastSignInAtMs: 1, deletion: null, ...fields
  };
}

export function membership(workspaceId: string, userId: string, fields: Partial<PlatformMembershipRecord> = {}): PlatformMembershipRecord {
  return { workspaceId, userId, policies: ["FluxIQAdministratorAccess"], groups: [], status: "active", createdAtMs: 1, updatedAtMs: 1, ...fields };
}

export async function resetReadRuntime() {
  await resetRouteRuntime();
  vi.stubEnv("FLUXIQ_PROFILE", "service");
  readRuntime.primary = runtime.primary;
  readRuntime.current = true;
  readRuntime.store = new MemoryPlatformStore();
  readRuntime.instances.clear();
  readRuntime.instances.set("workspace-main", runtime.primary);
  readRuntime.instances.set("tenant-a", runtime.tenantA);
  readRuntime.instances.set("tenant-b", runtime.tenantB);
  manager.tenancy = "multi";
  manager.get.mockImplementation((workspaceId: string) => {
    const fluxiq = readRuntime.instances.get(workspaceId);
    return fluxiq ? { workspaceId, fluxiq } : undefined;
  });
  manager.acquire.mockImplementation(async (workspaceId: string) => {
    const fluxiq = readRuntime.instances.get(workspaceId);
    if (!fluxiq) throw new Error("Fixture workspace is absent");
    const release = workspaceId === "workspace-main" ? runtime.releases.primary : workspaceId === "tenant-a" ? runtime.releases.a : runtime.releases.b;
    return { workspaceId, fluxiq, release };
  });
  readRuntime.legacyServices.mockImplementation(async () => ({ store: readRuntime.store }));
  readRuntime.storeFactory.mockImplementation(async () => readRuntime.store);
  readRuntime.auditRead.mockResolvedValue([]);
  readRuntime.auditFactory.mockImplementation(async () => ({ read: readRuntime.auditRead }));
  readRuntime.afterReload.mockImplementation(async () => readRuntime.primary);
  for (const userId of ["person-a", "person-b", "member-a", "member-b"]) await readRuntime.store.putAccount(account(userId));
  for (const suffix of ["a", "b"] as const) {
    const workspaceId = `tenant-${suffix}`;
    await readRuntime.store.putWorkspace({ workspaceId, kind: "organisation", ownerUserId: null, createdAtMs: 1 });
    await readRuntime.store.putMembership(membership(workspaceId, `person-${suffix}`));
    await readRuntime.store.putMembership(membership(workspaceId, `member-${suffix}`, { policies: ["FluxIQReadOnlyAccess"] }));
  }
  await readRuntime.store.putWorkspace({ workspaceId: "workspace-main", kind: "single", ownerUserId: null, createdAtMs: 1 });
  return readRuntime;
}

/** Synthetic context only for owner scheduling tests; route tests use real selection and IAM. */
export function readOwnerFixture(signal = new AbortController().signal) {
  const binding = { channel: "panel", workspaceId: "tenant-a", userId: "person-a", sessionId: "synthetic-session" } as const;
  const caller: WorkspaceRouteCaller = { channel: "panel", binding, actor: { sessionId: binding.sessionId, userId: binding.userId, roleId: "operator", permissions: [] } };
  const selected: WorkspaceRouteContext = {
    workspaceId: binding.workspaceId,
    fluxiq: readRuntime.base.tenantA as unknown as WorkspaceRouteContext["fluxiq"],
    binding, caller,
    current: () => !signal.aborted && readRuntime.current,
    revalidate: vi.fn(async () => ({ ok: true as const, caller })),
    release: readRuntime.base.releases.a
  };
  const current = {
    getFluxIQWorkspaces: () => readRuntime.manager,
    isCurrentFluxIQPrimary: (primary: unknown) => readRuntime.current && primary === readRuntime.primary
  } as unknown as ConstructorParameters<typeof WorkspaceAccountReadOwner>[1];
  return new WorkspaceAccountReadOwner(selected, current, signal);
}
