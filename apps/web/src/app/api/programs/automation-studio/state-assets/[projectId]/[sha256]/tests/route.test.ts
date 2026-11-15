import { beforeEach, describe, expect, it, vi } from "vitest";
import { registry, runtime } from "../../../../../../../../lib/workspaces/routes/tests/route-runtime";
import { assetParams, assetRequest, assets, pairedAssetRequest, resetAssetRuntime, SHA_A } from "./asset-runtime";
import { PUT } from "../route";

vi.mock("../../../../../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getFluxIQWebRuntimeStatus: runtime.presenter };
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
const DOMAIN_ERROR = { ok: false, errorCode: "authorization.project_domain", error: "This browser was paired for domain a projects, and this project is not one. Open a domain a project in FluxIQ, then try again." };

describe("selected tenant's state-asset upload", () => {
  it.each(["foreign-domain-project", "missing-project"])("retains the same non-disclosing project-domain refusal for %s", async projectId => {
    if (!assets.browser) throw new Error("Expected a fixture browser");
    assets.browser.projectId = null;
    const response = await PUT(pairedAssetRequest({ projectId }), assetParams(projectId));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(DOMAIN_ERROR);
    expect(assets.a.domain).toHaveBeenCalledWith(projectId, "domain-a");
    expect(assets.a.write).not.toHaveBeenCalled();
    expect(assets.primary.write).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("retains an explicitly bound client's project refusal before reading a body", async () => {
    const request = pairedAssetRequest({ projectId: "foreign-domain-project" });
    const read = vi.spyOn(request, "arrayBuffer");
    const response = await PUT(request, assetParams("foreign-domain-project"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "Client is not authorized for this Automation Studio project." });
    expect(read).not.toHaveBeenCalled();
    expect(assets.a.write).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("stores only through the selected tenant and current primary approver", async () => {
    runtime.policies.set("tenant-a", "user");
    const response = await PUT(pairedAssetRequest(), assetParams());
    expect(response.status).toBe(201);
    expect(assets.a.write).toHaveBeenCalledWith(expect.objectContaining({ projectId: "same-project", mediaType: "image/png", expectedSha256: SHA_A }));
    expect(runtime.primary.programs.identityAccess.snapshot).toHaveBeenCalled();
    expect(runtime.tenantA.programs.identityAccess.snapshot).not.toHaveBeenCalled();
    expect(runtime.tenantB.programs.clientGateway.authorizeToken).not.toHaveBeenCalled();
    expect(assets.b.write).not.toHaveBeenCalled();
    expect(assets.primary.write).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("allows a stable unbound project only after its approved-domain check", async () => {
    if (!assets.browser) throw new Error("Expected a fixture browser");
    assets.browser.projectId = null;
    expect((await PUT(pairedAssetRequest(), assetParams())).status).toBe(201);
    expect(assets.a.domain).toHaveBeenCalledWith("same-project", "domain-a");
  });

  it("refuses a foreign domain URL without a write or primary data fallback", async () => {
    expect((await PUT(pairedAssetRequest({ query: "?domainId=domain-b" }), assetParams())).status).toBe(403);
    expect(assets.a.write).not.toHaveBeenCalled();
    expect(assets.primary.write).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("keeps cookie A ahead of bearer B and leaves panel uploads without a paired-domain gate", async () => {
    const response = await PUT(assetRequest({ bearer: "browser-b-token" }), assetParams());
    expect(response.status).toBe(201);
    expect(assets.a.write).toHaveBeenCalledOnce();
    expect(assets.a.domain).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.tenantA.programs.clientGateway.authorizeToken).not.toHaveBeenCalled();
    expect(assets.b.write).not.toHaveBeenCalled();
    expect(assets.primary.write).not.toHaveBeenCalled();
  });

  it("never falls back from an invalid cookie to an otherwise proved browser", async () => {
    expect((await PUT(assetRequest({ cookie: "invalid", bearer: "browser-a-token" }), assetParams())).status).toBe(401);
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(assets.a.write).not.toHaveBeenCalled();
  });

  it("keeps same project ids isolated between two panel tenants", async () => {
    expect((await PUT(assetRequest(), assetParams())).status).toBe(201);
    expect((await PUT(assetRequest({ cookie: runtime.sessions.b }), assetParams())).status).toBe(201);
    expect(assets.a.write).toHaveBeenCalledOnce();
    expect(assets.b.write).toHaveBeenCalledOnce();
    expect(assets.primary.write).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).toHaveBeenCalledOnce();
  });

  it("retains actual own-project IAM permission and refuses another owner's project", async () => {
    runtime.policies.set("tenant-a", "user");
    expect((await PUT(assetRequest(), assetParams())).status).toBe(201);
    const request = assetRequest({ projectId: "foreign-owner-project" });
    const read = vi.spyOn(request, "arrayBuffer");
    expect((await PUT(request, assetParams("foreign-owner-project"))).status).toBe(403);
    expect(read).not.toHaveBeenCalled();
    expect(assets.a.write).toHaveBeenCalledOnce();
  });

  it.each(["local", "self-hosted"] as const)("preserves %s single-root panel writes", async profile => {
    runtime.manager.tenancy = "single";
    runtime.primary.programs.api = registry("workspace-main", profile);
    expect((await PUT(assetRequest(), assetParams())).status).toBe(201);
    expect(assets.primary.write).toHaveBeenCalledOnce();
    expect(assets.a.write).not.toHaveBeenCalled();
    expect(runtime.store.listMembershipsOfUser).not.toHaveBeenCalled();
    expect(runtime.releases.primary).toHaveBeenCalledOnce();
  });
});
