import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouteIamContract } from "../../../app-route-iam";
import { withWorkspaceAccountRead } from "..";
import { WorkspaceAccountReadOwner } from "../owner";
import { account, deferred, membership, readRuntime, resetReadRuntime, routeRequest } from "./read-runtime";

vi.mock("../../../fluxiq", async () => {
  const { readRuntime } = await import("./read-runtime");
  return {
    getFluxIQWorkspaces: () => readRuntime.manager,
    getFluxIQWebRuntimeStatus: readRuntime.base.presenter,
    isCurrentFluxIQPrimary: (primary: unknown) => readRuntime.current && primary === readRuntime.primary,
    getFluxIQAfterReload: readRuntime.afterReload
  };
});
vi.mock("../../../../server/provisioning-listener", async () => {
  const { readRuntime } = await import("./read-runtime");
  return { getPlatformServices: readRuntime.legacyServices, platformReadStoreFor: readRuntime.storeFactory, platformIamAuditReaderFor: readRuntime.auditFactory };
});
vi.mock("../../../../server/browser-trust", async () => {
  const { readRuntime } = await import("./read-runtime");
  return { resolveServiceClientHttpRoute: readRuntime.base.resolveBrowser };
});

const CONTRACT = appRouteIamContract("GET", "/api/accounts/members");
beforeEach(resetReadRuntime);
afterEach(() => vi.unstubAllEnvs());

describe("held account read response", () => {
  it("holds selected tenant and primary identity separately and exposes only bound read ports", async () => {
    const response = await withWorkspaceAccountRead(routeRequest(), CONTRACT, async context => {
      expect(Object.keys(context.store).sort()).toEqual(["getAccount", "getMembership", "getWorkspace", "listMemberships"]);
      expect(Object.keys(context.identityAccess)).toEqual(["snapshot"]);
      expect(Object.isFrozen(context)).toBe(true);
      expect(readRuntime.base.releases.a).not.toHaveBeenCalled();
      expect(readRuntime.base.releases.primary).not.toHaveBeenCalled();
      const own = await context.store.getAccount(context.userId);
      expect((await context.store.getWorkspace())?.workspaceId).toBe("tenant-a");
      return { status: 200, body: { ok: true, name: own?.displayName } };
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, name: "person-a" });
    expect(readRuntime.manager.acquire.mock.calls).toEqual([["tenant-a"], ["workspace-main"]]);
    expect(readRuntime.storeFactory).toHaveBeenCalledWith(readRuntime.primary);
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });

  it("returns an empty pinned audit through the read owner", async () => {
    const response = await withWorkspaceAccountRead(routeRequest(), appRouteIamContract("GET", "/api/security/audit"), async context => {
      const audit = await context.audit();
      return { status: 200, body: { records: await audit.read({ limit: 1 }) } };
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ records: [] });
    expect(readRuntime.auditFactory).toHaveBeenCalledWith(readRuntime.primary);
    expect(readRuntime.auditRead).toHaveBeenCalledWith({ limit: 1 });
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });

  it.each([null, "expired"])("refuses missing/invalid cookie before opening read data (%s)", async cookie => {
    const work = vi.fn();
    const response = await withWorkspaceAccountRead(routeRequest({ cookie }), CONTRACT, work);
    expect(response.status).toBe(401);
    expect(work).not.toHaveBeenCalled();
    expect(readRuntime.storeFactory).not.toHaveBeenCalled();
    expect(readRuntime.manager.acquire).not.toHaveBeenCalled();
  });

  it("rejects bearer-only authority and does not replace an invalid cookie with a bearer", async () => {
    const work = vi.fn();
    const paired = await withWorkspaceAccountRead(routeRequest({ cookie: null, bearer: "browser-a-token" }), CONTRACT, work);
    const invalid = await withWorkspaceAccountRead(routeRequest({ cookie: "expired", bearer: "browser-a-token" }), CONTRACT, work);
    expect(paired.status).toBe(403);
    expect(invalid.status).toBe(401);
    expect(readRuntime.base.resolveBrowser).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  it("preserves a buffered 400 and releases both leases", async () => {
    const response = await withWorkspaceAccountRead(routeRequest(), CONTRACT, () => ({ status: 400, body: { ok: false, code: "invalid_input", error: "Bad cursor" } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, code: "invalid_input", error: "Bad cursor" });
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });

  it("rechecks after serialization instead of publishing a response from a retired runtime", async () => {
    const response = await withWorkspaceAccountRead(routeRequest(), CONTRACT, () => ({
      status: 200,
      body: { toJSON: () => {
        readRuntime.current = false;
        return { private: "must not be published" };
      } }
    }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("must not be published");
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });

  it.each(["reload", "abort"])("refuses %s in the final validated promise continuation", async change => {
    const controller = new AbortController();
    let serialized = false;
    const originalGuard = WorkspaceAccountReadOwner.prototype.guard;
    const guarded = vi.spyOn(WorkspaceAccountReadOwner.prototype, "guard").mockImplementation(async function (this: WorkspaceAccountReadOwner) {
      await originalGuard.call(this);
      if (serialized) queueMicrotask(() => {
        if (change === "reload") readRuntime.current = false;
        else controller.abort();
      });
    });
    try {
      const response = await withWorkspaceAccountRead(routeRequest({ signal: controller.signal }), CONTRACT, () => ({
        status: 200,
        body: { toJSON: () => {
          serialized = true;
          return { private: "must not escape after final validation" };
        } }
      }));
      expect(response.status).toBe(change === "reload" ? 503 : 401);
      expect(await response.text()).not.toContain("must not escape");
      expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
      expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
    } finally {
      guarded.mockRestore();
    }
  });

  it("does not invoke a data factory after synchronous reload refusal", async () => {
    const response = await withWorkspaceAccountRead(routeRequest(), CONTRACT, async context => {
      readRuntime.current = false;
      await context.store.getAccount("member-a");
      return { status: 200, body: {} };
    });
    expect(response.status).toBe(503);
    expect(readRuntime.storeFactory).not.toHaveBeenCalled();
    expect(readRuntime.afterReload).not.toHaveBeenCalled();
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });

  it("refuses a reload during a pinned factory wait without selecting or awaiting a new primary", async () => {
    const gate = deferred();
    const entered = deferred();
    const pinned = readRuntime.primary;
    const store = readRuntime.store;
    const accountRead = vi.spyOn(store, "getAccount");
    readRuntime.storeFactory.mockImplementationOnce(async (primary: unknown) => {
      expect(primary).toBe(pinned);
      entered.resolve();
      await gate.promise;
      return store;
    });
    const responsePromise = withWorkspaceAccountRead(routeRequest(), CONTRACT, async context => {
      const found = await context.store.getAccount("member-a");
      return { status: 200, body: { name: found?.displayName } };
    });
    await entered.promise;
    readRuntime.current = false;
    readRuntime.afterReload.mockImplementation(() => new Promise(() => undefined));
    expect(readRuntime.base.releases.primary).not.toHaveBeenCalled();
    gate.resolve();
    const response = await responsePromise;
    expect(response.status).toBe(503);
    expect(accountRead.mock.calls.some(([userId]) => userId === "member-a")).toBe(false);
    expect(readRuntime.afterReload).not.toHaveBeenCalled();
    expect(readRuntime.storeFactory).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });

  it.each(["session", "membership", "selection", "account", "workspace", "tenant-runtime", "primary-runtime", "reload", "iam"])("drops sensitive data after %s changes during a store read", async change => {
    const gate = deferred<ReturnType<typeof account>>();
    const entered = deferred();
    const original = readRuntime.store.getAccount.bind(readRuntime.store);
    vi.spyOn(readRuntime.store, "getAccount").mockImplementation(userId => {
      if (userId !== "member-a") return original(userId);
      entered.resolve();
      return gate.promise;
    });
    const responsePromise = withWorkspaceAccountRead(routeRequest(), CONTRACT, async context => ({
      status: 200, body: { name: (await context.store.getAccount("member-a"))?.displayName }
    }));
    await entered.promise;
    if (change === "session") await readRuntime.base.identity.revokeSession(readRuntime.base.sessions.a);
    if (change === "membership") await readRuntime.store.putMembership(membership("tenant-a", "person-a", { status: "removed" }));
    if (change === "selection") await readRuntime.store.putMembership(membership("tenant-b", "person-a", { createdAtMs: 0 }));
    if (change === "account") await readRuntime.store.deleteAccount("person-a");
    if (change === "workspace") await readRuntime.store.deleteWorkspace("tenant-a");
    if (change === "tenant-runtime") readRuntime.instances.set("tenant-a", readRuntime.base.tenantB);
    if (change === "primary-runtime") readRuntime.primary = { ...readRuntime.primary };
    if (change === "reload") readRuntime.current = false;
    if (change === "iam") readRuntime.base.policies.set("tenant-a", "none");
    gate.resolve(account("member-a", { displayName: "private pending account name" }));
    const response = await responsePromise;
    const expected = change === "iam" ? 403 : ["tenant-runtime", "primary-runtime", "reload"].includes(change) ? 503 : 401;
    expect(response.status).toBe(expected);
    expect(await response.text()).not.toContain("private pending account name");
    expect(readRuntime.manager.acquire.mock.calls).toEqual([["tenant-a"], ["workspace-main"]]);
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });

  it("adopts and releases the primary lease if abort happens while acquisition is pending", async () => {
    const controller = new AbortController();
    const gate = deferred();
    const entered = deferred();
    const acquire = readRuntime.manager.acquire.getMockImplementation()!;
    readRuntime.manager.acquire.mockImplementation(async workspaceId => {
      if (workspaceId === "workspace-main") {
        entered.resolve();
        await gate.promise;
      }
      return acquire(workspaceId);
    });
    const work = vi.fn();
    const responsePromise = withWorkspaceAccountRead(routeRequest({ signal: controller.signal }), CONTRACT, work);
    await entered.promise;
    controller.abort();
    expect(readRuntime.base.releases.a).not.toHaveBeenCalled();
    gate.resolve();
    const response = await responsePromise;
    expect(response.status).toBe(401);
    expect(work).not.toHaveBeenCalled();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
  });

  it("drains another parallel read after Promise.all rejects before releasing either lease", async () => {
    const first = deferred<ReturnType<typeof account>>();
    const second = deferred<ReturnType<typeof account>>();
    const firstEntered = deferred();
    const secondEntered = deferred();
    const failed = deferred();
    const original = readRuntime.store.getAccount.bind(readRuntime.store);
    vi.spyOn(readRuntime.store, "getAccount").mockImplementation(userId => {
      if (userId === "member-a") {
        firstEntered.resolve();
        return first.promise;
      }
      if (userId === "member-b") {
        secondEntered.resolve();
        return second.promise;
      }
      return original(userId);
    });
    let completed = false;
    const responsePromise = withWorkspaceAccountRead(routeRequest(), CONTRACT, async context => {
      try {
        await Promise.all([context.store.getAccount("member-a"), context.store.getAccount("member-b")]);
      } catch (error) {
        failed.resolve();
        throw error;
      }
      return { status: 200, body: {} };
    }).then(response => {
      completed = true;
      return response;
    });
    await Promise.all([firstEntered.promise, secondEntered.promise]);
    first.reject(new Error("private first account path"));
    await failed.promise;
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(completed).toBe(false);
    expect(readRuntime.base.releases.a).not.toHaveBeenCalled();
    expect(readRuntime.base.releases.primary).not.toHaveBeenCalled();
    second.resolve(account("member-b"));
    const response = await responsePromise;
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/private|member-b/u);
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });

  it("sanitizes data exceptions and still releases selected and primary leases", async () => {
    readRuntime.storeFactory.mockRejectedValue(new Error("private account database at C:/secret/store.sqlite"));
    const response = await withWorkspaceAccountRead(routeRequest(), CONTRACT, async context => {
      await context.store.getAccount("member-a");
      return { status: 200, body: {} };
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, code: "temporarily_unavailable", error: "Account data could not be read. Try again." });
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });

  it("releases the tenant even if primary release fails and logs only a fixed code", async () => {
    readRuntime.base.releases.primary.mockImplementation(() => { throw new Error("private primary lease detail"); });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await withWorkspaceAccountRead(routeRequest(), CONTRACT, () => ({ status: 200, body: {} }));
      expect(response.status).toBe(503);
      expect(logged).toHaveBeenCalledWith("account_read.cleanup_failed");
      expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
      expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    } finally {
      logged.mockRestore();
    }
  });
});
