import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runtime } from "../../../../../lib/workspaces/routes/tests/route-runtime";
import { resetSnapshotRuntime, snapshotRuntime } from "../../snapshot/tests/snapshot-runtime";
import { POST } from "../route";
import { contextRequest } from "./request";

vi.mock("../../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  const { snapshotRuntime } = await import("../../snapshot/tests/snapshot-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getWorkspaceWebPresentation: runtime.presenter, getFluxIQWebRuntimeStatus: () => { throw new Error("Unexpected primary presentation"); }, isCurrentFluxIQPrimary: (instance: unknown) => snapshotRuntime.primaryCurrent && instance === runtime.primary };
});
vi.mock("../../../../../server/provisioning-listener", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getPlatformServices: async () => ({ store: runtime.store }) };
});
vi.mock("../../../../../server/browser-trust", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  return { resolveServiceClientHttpRoute: runtime.resolveBrowser };
});

beforeEach(resetSnapshotRuntime);
afterEach(() => vi.unstubAllEnvs());

describe("held workspace context selection", () => {
  it("writes only the selected tenant and trusted user's normalized slot", async () => {
    const response = await POST(contextRequest({ activeProjectId: " same-project ", activeFlowId: " same-flow ", clientId: " browser-a ", workspaceId: "tenant-b", operatorUserId: "person-b" }));
    expect(response.status).toBe(200);
    expect((await response.json()).payload).toMatchObject({ workspaceId: "tenant-a", automationStudio: { activeProjectId: "same-project", activeFlowId: "same-flow", contextCount: 2 } });
    expect(snapshotRuntime.owners.get("a")!.forCaller({ userId: "person-a", clientId: "browser-a" }).context()).toMatchObject({ operatorUserId: "person-a", clientId: "browser-a", activeProjectId: "same-project" });
    expect(snapshotRuntime.owners.get("b")!.forCaller({ userId: "person-a", clientId: "browser-a" }).context()).toBeUndefined();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("handles colliding project/flow/client ids in a second selected tenant", async () => {
    const response = await POST(contextRequest({ activeProjectId: "same-project", activeFlowId: "same-flow", clientId: "browser-a" }, { cookie: runtime.sessions.b, domain: "domain-b" }));
    expect(response.status).toBe(200);
    expect((await response.json()).payload.workspaceId).toBe("tenant-b");
    expect(snapshotRuntime.owners.get("b")!.forCaller({ userId: "person-b", clientId: "browser-a" }).context()?.activeProjectId).toBe("same-project");
    expect(snapshotRuntime.owners.get("a")!.forCaller({ userId: "person-a", clientId: "browser-a" }).context()?.clientId).toBeUndefined();
    expect(runtime.releases.b).toHaveBeenCalledOnce();
  });

  it("clears project and Flow deliberately without a project lookup", async () => {
    const response = await POST(contextRequest({ activeProjectId: null, activeFlowId: "ignored" }));
    expect(response.status).toBe(200);
    expect((await response.json()).payload.automationStudio).toMatchObject({ activeProjectId: null, activeFlowId: null });
    expect(snapshotRuntime.domains.a).not.toHaveBeenCalled();
    expect(snapshotRuntime.flows.a).not.toHaveBeenCalled();
    expect(snapshotRuntime.owners.get("a")!.forCaller({ userId: "person-a" }).context()?.activeProjectId).toBeNull();
  });

  it.each(["foreign", "unknown", "revoked"])("refuses a %s requested client rather than treating its id as authority", async kind => {
    const clientId = kind === "foreign" ? "browser-foreign" : kind === "unknown" ? "missing-browser" : "browser-a";
    if (kind === "revoked") snapshotRuntime.views.get("a")!.trustedClients[0]!.status = "revoked";
    const response = await POST(contextRequest({ activeProjectId: null, clientId }));
    expect(response.status).toBe(403);
    expect(snapshotRuntime.owners.get("a")!.forCaller({ userId: "person-a", clientId }).context()?.clientId).toBeUndefined();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each([[], null, { activeProjectId: 123 }, { activeFlowId: {} }, { clientId: false }])("rejects malformed body %j without clearing existing context", async body => {
    const response = await POST(contextRequest(body));
    expect(response.status).toBe(400);
    expect(snapshotRuntime.owners.get("a")!.forCaller({ userId: "person-a" }).context()?.activeProjectId).toBe("same-project");
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("does not turn malformed JSON into a successful clear", async () => {
    const request = contextRequest(null);
    vi.spyOn(request, "json").mockRejectedValueOnce(new SyntaxError("Private parser payload"));
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("Private parser");
    expect(snapshotRuntime.owners.get("a")!.forCaller({ userId: "person-a" }).context()?.activeProjectId).toBe("same-project");
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("keeps cookie-first identity: a valid cookie wins over a bearer, and an invalid cookie never falls back to one", async () => {
    expect((await POST(contextRequest({ activeProjectId: null }, { bearer: "invalid" }))).status).toBe(200);
    expect((await POST(contextRequest({ activeProjectId: null }, { cookie: "invalid", bearer: "browser-a-token" }))).status).toBe(401);
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["project", "flow", "domain"])("refuses an unavailable %s before committing", async target => {
    const body = { activeProjectId: target === "project" ? "unknown-project" : "same-project", activeFlowId: target === "flow" ? "unknown-flow" : "same-flow" };
    if (target === "domain") snapshotRuntime.projects.get("a")![0]!.domainId = "domain-other";
    const response = await POST(contextRequest(body));
    expect(response.status).toBe(403);
    expect(snapshotRuntime.owners.get("a")!.forCaller({ userId: "person-a" }).context()?.activeFlowId).toBe("same-flow");
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });
});
