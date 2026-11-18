import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { account, deferred, membership, readRuntime, resetReadRuntime, routeRequest } from "../../../../../lib/workspaces/account-reads/tests/read-runtime";
import { memoryAudit, record, userFrn } from "../../server/tests/audit-harness";

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

const URL = "https://panel.example.test/api/security/audit";
beforeEach(resetReadRuntime);
afterEach(() => vi.unstubAllEnvs());

describe("selected workspace audit read", () => {
  it("keeps cookie-only authority and refuses bearer-only requests before opening the audit", async () => {
    expect((await GET(routeRequest({ cookie: null, url: URL }))).status).toBe(401);
    expect((await GET(routeRequest({ cookie: null, bearer: "browser-a-token", url: URL }))).status).toBe(403);
    expect(readRuntime.auditFactory).not.toHaveBeenCalled();
    expect(readRuntime.base.resolveBrowser).not.toHaveBeenCalled();
  });

  it("decides from selected tenant policy before opening data and never uses primary IAM", async () => {
    const primaryAuthorize = vi.spyOn(readRuntime.primary.programs.api, "authorize");
    readRuntime.base.policies.set("tenant-a", "none");
    const response = await GET(routeRequest({ url: URL }));
    expect(response.status).toBe(403);
    expect(readRuntime.auditFactory).not.toHaveBeenCalled();
    expect(readRuntime.auditRead).not.toHaveBeenCalled();
    expect(primaryAuthorize).not.toHaveBeenCalled();
  });

  it("filters foreign events before names and projects only safe activity fields", async () => {
    await readRuntime.store.putAccount(account("member-b", { displayName: "Foreign private member name" }));
    readRuntime.auditRead.mockResolvedValue([
      record({ time: 4, principal: userFrn("tenant-b", "member-b"), action: "studio:Foreign", resources: ["frn:fluxiq:studio:tenant-b:project/same-project"] }),
      record({ time: 3, principal: userFrn("tenant-a", "person-a"), action: "studio:ForeignTarget", resources: ["frn:fluxiq:studio:tenant-b:project/same-project"] }),
      record({ time: 2, principal: userFrn("tenant-a", "member-b"), action: "studio:ReadProject", resources: ["frn:fluxiq:platform::account/member-b"], requestId: "private-request-id", origin: "extension-chat", ipPrefix: "private-address" }),
      record({ time: 1, principal: userFrn("tenant-a", "person-a"), action: "studio:ReadProject", resources: [userFrn("tenant-a", "member-a")], hidden: 2 })
    ]);
    const accountRead = vi.spyOn(readRuntime.store, "getAccount");
    const response = await GET(routeRequest({ url: URL }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const page = (await response.json()).payload;
    expect(page.entries).toEqual([
      { at: 2000, who: "Someone no longer in this workspace", action: "studio:ReadProject", outcome: "allowed", resources: ["account member-b"] },
      { at: 1000, who: "person-a", action: "studio:ReadProject", outcome: "allowed", resources: ["member-a"], hidden: 2 }
    ]);
    expect(JSON.stringify(page)).not.toMatch(/Foreign|private|tenant-b|frn:|requestId|ipPrefix|extension-chat/u);
    expect(accountRead.mock.calls.some(([userId]) => userId === "member-b")).toBe(false);
    expect(readRuntime.auditFactory).toHaveBeenCalledWith(readRuntime.primary);
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });

  it("does not disclose a subject name when membership is removed during its account lookup", async () => {
    const gate = deferred<ReturnType<typeof account>>();
    const entered = deferred();
    readRuntime.auditRead.mockResolvedValue([record({ time: 1, principal: userFrn("tenant-a", "member-a") })]);
    const getAccount = readRuntime.store.getAccount.bind(readRuntime.store);
    vi.spyOn(readRuntime.store, "getAccount").mockImplementation(userId => {
      if (userId !== "member-a") return getAccount(userId);
      entered.resolve();
      return gate.promise;
    });
    const pending = GET(routeRequest({ url: URL }));
    await entered.promise;
    await readRuntime.store.putMembership(membership("tenant-a", "member-a", { status: "removed" }));
    gate.resolve(account("member-a", { displayName: "Removed private subject name" }));
    const response = await pending;
    expect(response.status).toBe(200);
    const page = (await response.json()).payload;
    expect(page.entries[0].who).toBe("Someone no longer in this workspace");
    expect(JSON.stringify(page)).not.toContain("Removed private subject name");
  });

  it("keeps invalid cursor status400 after authorization without opening audit data", async () => {
    const response = await GET(routeRequest({ url: `${URL}?cursor=not-a-cursor` }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, code: "invalid_input", error: "That page of activity could not be read. Reload to start again." });
    expect(readRuntime.auditFactory).not.toHaveBeenCalled();
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });

  it("preserves cursor boundaries and every own record across busy seconds", async () => {
    const records = [];
    for (let index = 0; index < 130; index += 1) {
      records.push(record({ time: 100 + Math.floor(index / 40), principal: userFrn("tenant-a", "person-a"), action: `studio:Step${index}` }));
      if (index % 3 === 0) records.push(record({ time: 100 + Math.floor(index / 40), principal: userFrn("tenant-b", "person-b"), action: "studio:Foreign" }));
    }
    const audit = memoryAudit(records);
    readRuntime.auditRead.mockImplementation(query => audit.read(query));
    const actions: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await GET(routeRequest({ url: `${URL}${cursor === null ? "" : `?cursor=${encodeURIComponent(cursor)}`}` }));
      expect(response.status).toBe(200);
      const page = (await response.json()).payload;
      actions.push(...page.entries.map((entry: { action: string }) => entry.action));
      cursor = page.next;
    } while (cursor !== null);
    expect(actions).toHaveLength(130);
    expect(new Set(actions).size).toBe(130);
    expect(actions).not.toContain("studio:Foreign");
    expect(actions).toEqual(Array.from({ length: 130 }, (_, index) => `studio:Step${129 - index}`));
  });

  it.each(["session", "account", "selection", "runtime"])("refuses %s changes while a shared audit read is pending", async change => {
    const gate = deferred<ReturnType<typeof record>[]>();
    const entered = deferred();
    readRuntime.auditRead.mockImplementationOnce(() => {
      entered.resolve();
      return gate.promise;
    });
    const pending = GET(routeRequest({ url: URL }));
    await entered.promise;
    if (change === "session") await readRuntime.base.identity.revokeSession(readRuntime.base.sessions.a);
    if (change === "account") await readRuntime.store.putAccount(account("person-a", { status: "disabled" }));
    if (change === "selection") await readRuntime.store.putMembership(membership("tenant-b", "person-a", { createdAtMs: 0 }));
    if (change === "runtime") readRuntime.current = false;
    expect(readRuntime.base.releases.a).not.toHaveBeenCalled();
    expect(readRuntime.base.releases.primary).not.toHaveBeenCalled();
    gate.resolve([record({ time: 1, principal: userFrn("tenant-a", "person-a"), action: "studio:PrivatePending" })]);
    const response = await pending;
    expect(response.status).toBe(change === "runtime" ? 503 : 401);
    expect(await response.text()).not.toContain("PrivatePending");
    expect(readRuntime.manager.acquire.mock.calls).toEqual([["tenant-a"], ["workspace-main"]]);
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });

  it("sanitizes audit IO failure and releases both owners", async () => {
    readRuntime.auditRead.mockRejectedValue(new Error("private IAM audit at C:/secret/iam-audit.sqlite"));
    const response = await GET(routeRequest({ url: URL }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/private|sqlite|secret/u);
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });
});
