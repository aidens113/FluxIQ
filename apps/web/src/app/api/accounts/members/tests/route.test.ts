import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { account, deferred, membership, readRuntime, registry, resetReadRuntime, routeRequest } from "../../../../../lib/workspaces/account-reads/tests/read-runtime";

vi.mock("../../../../../lib/fluxiq", async () => {
  const { readRuntime } = await import("../../../../../lib/workspaces/account-reads/tests/read-runtime");
  return {
    getFluxIQWorkspaces: () => readRuntime.manager,
    getFluxIQWebRuntimeStatus: readRuntime.base.presenter,
    isCurrentFluxIQPrimary: (primary: unknown) => readRuntime.current && primary === readRuntime.primary
  };
});
vi.mock("../../../../../server/provisioning-listener", async () => {
  const { readRuntime } = await import("../../../../../lib/workspaces/account-reads/tests/read-runtime");
  return { getPlatformServices: readRuntime.legacyServices, platformReadStoreFor: readRuntime.storeFactory, platformIamAuditReaderFor: readRuntime.auditFactory };
});
vi.mock("../../../../../server/browser-trust", async () => {
  const { readRuntime } = await import("../../../../../lib/workspaces/account-reads/tests/read-runtime");
  return { resolveServiceClientHttpRoute: readRuntime.base.resolveBrowser };
});

import { GET } from "../route";

beforeEach(resetReadRuntime);
afterEach(() => vi.unstubAllEnvs());

describe("selected workspace members read", () => {
  it("isolates two memberships of the same user and does not authorize on primary", async () => {
    await readRuntime.store.putMembership(membership("tenant-b", "person-a", { policies: ["FluxIQUserAccess"], createdAtMs: 2 }));
    const primaryAuthorize = vi.spyOn(readRuntime.primary.programs.api, "authorize");
    const a = await GET(routeRequest());
    const viewA = (await a.json()).payload;
    expect(viewA.members.map((row: { userId: string }) => row.userId).sort()).toEqual(["member-a", "person-a"]);
    // An organisation's members are administered one membership at a time; removal waits on the panel's wording.
    expect(viewA).toMatchObject({ workspaceKind: "organisation", readOnly: false, canRemove: false, assignableRoles: ["administrator", "read-only", "member"] });
    await readRuntime.store.putMembership(membership("tenant-a", "person-a", { status: "removed" }));
    const b = await GET(routeRequest());
    const viewB = (await b.json()).payload;
    expect(viewB.members.map((row: { userId: string }) => row.userId).sort()).toEqual(["member-b", "person-a", "person-b"]);
    expect(viewB.members.find((row: { userId: string }) => row.userId === "person-a")).toMatchObject({ role: "member", self: true });
    expect(readRuntime.manager.acquire.mock.calls).toEqual([["tenant-a"], ["workspace-main"], ["tenant-b"], ["workspace-main"]]);
    expect(primaryAuthorize).not.toHaveBeenCalled();
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.b).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledTimes(2);
  });

  it("decides by selected tenant policy rather than the primary role's legacy permission", async () => {
    await readRuntime.base.identity.updateUser({ id: "person-a", roleId: "reader" });
    const allowed = await GET(routeRequest());
    expect(allowed.status).toBe(200);
    await allowed.json();
    readRuntime.storeFactory.mockClear();
    await readRuntime.base.identity.upsertRole({ id: "host-admin", permissions: ["identity.manage"] });
    await readRuntime.base.identity.updateUser({ id: "person-a", roleId: "host-admin" });
    readRuntime.base.policies.set("tenant-a", "user");
    const refused = await GET(routeRequest());
    expect(refused.status).toBe(403);
    expect(readRuntime.storeFactory).not.toHaveBeenCalled();
  });

  it("keeps a missing cookie unauthenticated and refuses bearer-only access", async () => {
    expect((await GET(routeRequest({ cookie: null }))).status).toBe(401);
    expect((await GET(routeRequest({ cookie: null, bearer: "browser-a-token" }))).status).toBe(403);
    expect(readRuntime.storeFactory).not.toHaveBeenCalled();
    expect(readRuntime.base.resolveBrowser).not.toHaveBeenCalled();
  });

  it("keeps only allowlisted account fields and rejects a foreign membership row", async () => {
    const list = readRuntime.store.listMembershipsOfWorkspace.bind(readRuntime.store);
    vi.spyOn(readRuntime.store, "listMembershipsOfWorkspace").mockImplementation(async workspaceId => [
      ...await list(workspaceId), membership("tenant-b", "member-b")
    ]);
    const accountRead = vi.spyOn(readRuntime.store, "getAccount");
    const response = await GET(routeRequest());
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toMatch(/externalId|identities|termsVersion|deletion|groups|policies|sessionId|member-b|person-b/u);
    expect(accountRead.mock.calls.some(([userId]) => userId === "member-b")).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("omits missing/deleted accounts instead of falling back to global identity users in service", async () => {
    await readRuntime.store.deleteAccount("member-a");
    await readRuntime.base.identity.upsertUser({ id: "legacy-person", username: "legacy-person", displayName: "Private legacy person", roleId: "reader" });
    const response = await GET(routeRequest());
    expect((await response.json()).payload.members.map((row: { userId: string }) => row.userId)).toEqual(["person-a"]);
  });

  it("rechecks a subject's exact membership after its account read", async () => {
    const gate = deferred<ReturnType<typeof account>>();
    const entered = deferred();
    const getAccount = readRuntime.store.getAccount.bind(readRuntime.store);
    vi.spyOn(readRuntime.store, "getAccount").mockImplementation(userId => {
      if (userId !== "member-a") return getAccount(userId);
      entered.resolve();
      return gate.promise;
    });
    const pending = GET(routeRequest());
    await entered.promise;
    await readRuntime.store.putMembership(membership("tenant-a", "member-a", { status: "removed" }));
    gate.resolve(account("member-a", { displayName: "Removed private person" }));
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("Removed private person");
  });

  it("refuses caller disablement while a member list is pending", async () => {
    const gate = deferred<Awaited<ReturnType<typeof readRuntime.store.listMembershipsOfWorkspace>>>();
    const entered = deferred();
    const rows = await readRuntime.store.listMembershipsOfWorkspace("tenant-a");
    vi.spyOn(readRuntime.store, "listMembershipsOfWorkspace").mockImplementationOnce(() => {
      entered.resolve();
      return gate.promise;
    });
    const pending = GET(routeRequest());
    await entered.promise;
    await readRuntime.store.putAccount(account("person-a", { status: "disabled" }));
    gate.resolve(rows);
    const response = await pending;
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("member-a");
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });

  it.each(["local", "self-hosted"] as const)("preserves legacy identity-only users and existing actions under %s", async profile => {
    vi.stubEnv("FLUXIQ_PROFILE", profile);
    readRuntime.manager.tenancy = "single";
    readRuntime.primary.programs.api = registry("workspace-main", profile);
    await readRuntime.base.identity.upsertRole({ id: "host-admin", permissions: ["identity.manage"] });
    await readRuntime.base.identity.updateUser({ id: "person-a", roleId: "host-admin" });
    await readRuntime.store.putMembership(membership("workspace-main", "person-a"));
    await readRuntime.base.identity.upsertUser({ id: "legacy-person", username: "legacy", displayName: "Legacy person", roleId: "reader" });
    const response = await GET(routeRequest());
    const view = (await response.json()).payload;
    expect(view).toMatchObject({ readOnly: false, canRemove: true, assignableRoles: ["administrator", "read-only"] });
    expect(view.members.find((row: { userId: string }) => row.userId === "legacy-person")).toMatchObject({ source: "identity", name: "Legacy person" });
    expect(readRuntime.manager.acquire.mock.calls).toEqual([["workspace-main"]]);
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });
});
