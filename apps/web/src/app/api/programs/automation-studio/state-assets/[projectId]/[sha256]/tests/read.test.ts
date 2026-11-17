import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, registry, runtime } from "../../../../../../../../lib/workspaces/routes/tests/route-runtime";
import { assetParams, assetRequest, assets, pairedAssetRequest, PNG_A, PNG_B, resetAssetRuntime, SHA_A, SHA_B } from "./asset-runtime";
import { GET } from "../route";

vi.mock("../../../../../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getFluxIQWebRuntimeStatus: runtime.presenter, isCurrentFluxIQPrimary: (instance: unknown) => instance === runtime.primary };
});
vi.mock("../../../../../../../../server/provisioning-listener", async () => {
  const { runtime } = await import("../../../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getPlatformServices: async () => ({ store: runtime.store }) };
});
vi.mock("../../../../../../../../server/browser-trust", async () => {
  const { runtime } = await import("../../../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { resolveServiceClientHttpRoute: runtime.resolveBrowser };
});

beforeEach(resetAssetRuntime);

describe("selected tenant's buffered state-asset reads", () => {
  it("separates matching project ids and never finds A's content through B or primary", async () => {
    const first = await GET(assetRequest({ method: "GET", bearer: "browser-b-token" }), assetParams());
    const absent = await GET(assetRequest({ method: "GET", cookie: runtime.sessions.b }), assetParams());
    const second = await GET(assetRequest({ method: "GET", cookie: runtime.sessions.b, sha256: SHA_B }), assetParams("same-project", SHA_B));
    expect(first.status).toBe(200);
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(PNG_A);
    expect(absent.status).toBe(404);
    expect(second.status).toBe(200);
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(PNG_B);
    expect(assets.a.read).toHaveBeenCalledWith("same-project", SHA_A);
    expect(assets.b.read.mock.calls).toEqual([["same-project", SHA_A], ["same-project", SHA_B]]);
    expect(assets.primary.read).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).toHaveBeenCalledTimes(2);
  });

  it("retains media/length/digest handling while refusing browser cache reuse across accounts", async () => {
    const response = await GET(assetRequest({ method: "GET", sha256: SHA_A.toUpperCase() }), assetParams("same-project", SHA_A.toUpperCase()));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe(String(PNG_A.byteLength));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-fluxiq-object-sha256")).toBe(SHA_A);
    expect(assets.a.read).toHaveBeenCalledWith("same-project", SHA_A);
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("refuses a bearer on this panel-only route before proof lookup or acquisition", async () => {
    expect((await GET(pairedAssetRequest({ method: "GET" }), assetParams())).status).toBe(403);
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(runtime.primary.programs.identityAccess.validateSession).not.toHaveBeenCalled();
    expect(assets.a.read).not.toHaveBeenCalled();
  });

  it("refuses an invalid cookie despite a proved bearer without a primary read", async () => {
    expect((await GET(assetRequest({ method: "GET", cookie: "invalid", bearer: "browser-a-token" }), assetParams())).status).toBe(401);
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(assets.primary.read).not.toHaveBeenCalled();
  });

  it("retains actual own-project IAM while refusing another owner's project", async () => {
    runtime.policies.set("tenant-a", "user");
    expect((await GET(assetRequest({ method: "GET" }), assetParams())).status).toBe(200);
    expect((await GET(assetRequest({ method: "GET", projectId: "foreign-owner-project" }), assetParams("foreign-owner-project"))).status).toBe(403);
    expect(assets.a.read).toHaveBeenCalledOnce();
    expect(assets.primary.read).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledTimes(2);
  });

  it("retains digest validation without reading an object", async () => {
    const response = await GET(assetRequest({ method: "GET", sha256: "bad-digest" }), assetParams("same-project", "bad-digest"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Invalid object digest" });
    expect(assets.a.read).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("keeps read failures non-disclosing and releases the selected lease", async () => {
    assets.a.read.mockRejectedValueOnce(new Error("Synthetic private asset path"));
    const response = await GET(assetRequest({ method: "GET" }), assetParams());
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: false, error: "State asset was not found or is not available." });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["membership", "session", "user", "iam", "policy-store", "abort"])("withholds bytes after %s ends authority during a pending read", async change => {
    const controller = new AbortController();
    const entered = deferred();
    const gate = deferred();
    assets.a.read.mockImplementationOnce(async () => {
      entered.resolve();
      await gate.promise;
      return { content: PNG_A, mediaType: "image/png", size: PNG_A.byteLength, sha256: SHA_A };
    });
    const pending = GET(assetRequest({ method: "GET", signal: controller.signal }), assetParams());
    await entered.promise;
    expect(runtime.releases.a).not.toHaveBeenCalled();
    if (change === "membership") runtime.memberships.set("person-a", []);
    if (change === "session") await runtime.identity.revokeSession(runtime.sessions.a);
    if (change === "user") await runtime.identity.updateUser({ id: "person-a", enabled: false });
    if (change === "iam") runtime.policies.set("tenant-a", "none");
    if (change === "policy-store") runtime.policyError = true;
    if (change === "abort") controller.abort();
    gate.resolve();
    const response = await pending;
    expect(response.status).toBe(change === "iam" ? 403 : change === "policy-store" ? 503 : 401);
    expect(response.headers.get("x-fluxiq-object-sha256")).toBeNull();
    expect(await response.json()).toMatchObject({ ok: false });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(assets.primary.read).not.toHaveBeenCalled();
  });

  it.each(["local", "self-hosted"] as const)("preserves %s single-root reads", async profile => {
    runtime.manager.tenancy = "single";
    runtime.primary.programs.api = registry("workspace-main", profile);
    const response = await GET(assetRequest({ method: "GET" }), assetParams());
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_A);
    expect(runtime.store.listMembershipsOfUser).not.toHaveBeenCalled();
    expect(runtime.releases.primary).toHaveBeenCalledOnce();
  });
});
