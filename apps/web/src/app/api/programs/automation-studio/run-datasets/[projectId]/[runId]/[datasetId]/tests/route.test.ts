import { beforeEach, describe, expect, it, vi } from "vitest";
import { registry, routeRequest, runtime } from "../../../../../../../../../lib/workspaces/routes/tests/route-runtime";
import { BASE_URL, changeAuthority, datasetSource, params, resetDatasetRuntime, studios } from "./route-runtime";

vi.mock("../../../../../../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getFluxIQWebRuntimeStatus: runtime.presenter, isCurrentFluxIQPrimary: (instance: unknown) => instance === runtime.primary };
});
vi.mock("../../../../../../../../../server/provisioning-listener", async () => {
  const { runtime } = await import("../../../../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getPlatformServices: async () => ({ store: runtime.store }) };
});
vi.mock("../../../../../../../../../server/browser-trust", async () => {
  const { runtime } = await import("../../../../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { resolveServiceClientHttpRoute: runtime.resolveBrowser };
});

import { GET } from "../route";

let sources: Awaited<ReturnType<typeof resetDatasetRuntime>>;
beforeEach(async () => { sources = await resetDatasetRuntime(); });

describe("tenant run dataset export", () => {
  it.each([null, "expired-session"])("answers 401 for a missing or invalid cookie (%s)", async cookie => {
    const response = await GET(routeRequest({ url: BASE_URL, cookie }), params());
    expect(response.status).toBe(401);
    expect(studios.a.assertProjectDomainAccess).not.toHaveBeenCalled();
    expect(studios.a.runDatasets.streamRunDataset).not.toHaveBeenCalled();
    expect(studios.primary.runDatasets.streamRunDataset).not.toHaveBeenCalled();
  });

  it("refuses a bearer-only caller before looking up a proof or selecting a tenant", async () => {
    const response = await GET(routeRequest({ url: BASE_URL, cookie: null, bearer: "browser-a-token" }), params());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "This endpoint is not available to a paired client." });
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
  });

  it("keeps cookie authority on mixed input and never substitutes a bearer for an invalid cookie", async () => {
    const invalid = await GET(routeRequest({ url: BASE_URL, cookie: "expired", bearer: "browser-a-token" }), params());
    expect(invalid.status).toBe(401);
    const valid = await GET(routeRequest({ url: BASE_URL, bearer: "foreign-token" }), params());
    expect(valid.status).toBe(200);
    await valid.body!.cancel();
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
  });

  it.each(["local", "self-hosted"] as const)("checks the current user's legacy permission under %s", async profile => {
    runtime.manager.tenancy = "single";
    runtime.primary.programs.api = registry("workspace-main", profile);
    await changeAuthority("role");
    const response = await GET(routeRequest({ url: BASE_URL }), params());
    expect(response.status).toBe(403);
    expect(studios.primary.assertProjectDomainAccess).not.toHaveBeenCalled();
    expect(studios.primary.runDatasets.streamRunDataset).not.toHaveBeenCalled();
    expect(runtime.releases.primary).toHaveBeenCalledOnce();
  });

  it("uses service IAM policies when the current role has no legacy permission", async () => {
    await changeAuthority("role");
    const response = await GET(routeRequest({ url: BASE_URL }), params());
    expect(response.status).toBe(200);
    await response.body!.cancel();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("uses the selected tenant's actual IAM registry", async () => {
    runtime.policies.set("tenant-a", "none");
    const response = await GET(routeRequest({ url: BASE_URL }), params());
    expect(response.status).toBe(403);
    expect(studios.a.runDatasets.streamRunDataset).not.toHaveBeenCalled();
    expect(studios.primary.runDatasets.streamRunDataset).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each([
    { projectId: "%E0%A4%A" }, { runId: "%" }, { datasetId: "%C0%AF" },
    { projectId: "project/../private" }, { runId: "" }, { datasetId: "x".repeat(201) }
  ])("answers a safe 400 for malformed encoding or an invalid id (%j)", async invalid => {
    const response = await GET(routeRequest({ url: BASE_URL }), params(invalid));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Invalid run dataset identifier." });
    expect(studios.a.runDatasets.streamRunDataset).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("answers 400 for an unsupported format", async () => {
    const response = await GET(routeRequest({ url: `${BASE_URL}?format=xlsx` }), params());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Run dataset export format must be csv or json." });
    expect(studios.a.runDatasets.streamRunDataset).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("hides a domain mismatch behind the same 404 as an unknown dataset", async () => {
    studios.a.assertProjectDomainAccess.mockRejectedValue(new Error("private project path and rows"));
    const denied = await GET(routeRequest({ url: `${BASE_URL}?domainId=other-domain` }), params());
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual({ ok: false, error: "Run dataset was not found or is not available." });
    expect(studios.a.assertProjectDomainAccess).toHaveBeenCalledWith("project.one", "other-domain");
    expect(studios.a.runDatasets.streamRunDataset).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("answers the hidden 404 when the selected tenant stored no dataset", async () => {
    studios.a.runDatasets.streamRunDataset.mockResolvedValue(null);
    const response = await GET(routeRequest({ url: BASE_URL }), params());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "Run dataset was not found or is not available." });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("isolates identical project/run/dataset ids in two tenants without using primary data", async () => {
    const primaryAuthorize = vi.spyOn(runtime.primary.programs.api, "authorize");
    const a = await GET(routeRequest({ url: BASE_URL }), params());
    const b = await GET(routeRequest({ url: BASE_URL, cookie: runtime.sessions.b }), params());
    expect(runtime.manager.acquire.mock.calls).toEqual([["tenant-a"], ["tenant-b"]]);
    expect(sources.a.next).not.toHaveBeenCalled();
    expect(sources.b.next).not.toHaveBeenCalled();
    expect(runtime.releases.a).not.toHaveBeenCalled();
    expect(runtime.releases.b).not.toHaveBeenCalled();
    expect(await a.text()).toBe("Name\r\nTenant A\r\n");
    expect(await b.text()).toBe("Name\r\nTenant B\r\n");
    expect(studios.a.runDatasets.streamRunDataset).toHaveBeenCalledWith({ projectId: "project.one", runId: "run.one", datasetId: "listings", format: "csv", actorId: "person-a" });
    expect(studios.b.runDatasets.streamRunDataset).toHaveBeenCalledWith({ projectId: "project.one", runId: "run.one", datasetId: "listings", format: "csv", actorId: "person-b" });
    expect(studios.primary.assertProjectDomainAccess).not.toHaveBeenCalled();
    expect(studios.primary.runDatasets.streamRunDataset).not.toHaveBeenCalled();
    expect(primaryAuthorize).not.toHaveBeenCalled();
    expect(runtime.releases.primary).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).toHaveBeenCalledOnce();
  });

  it.each(["local", "self-hosted"] as const)("retains the %s single-root behavior", async profile => {
    runtime.manager.tenancy = "single";
    runtime.primary.programs.api = registry("workspace-main", profile);
    const response = await GET(routeRequest({ url: BASE_URL }), params());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Private primary rows\r\n");
    expect(studios.a.runDatasets.streamRunDataset).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).toHaveBeenCalledOnce();
    expect(runtime.manager.acquire).toHaveBeenCalledWith("workspace-main");
    expect(runtime.releases.primary).toHaveBeenCalledOnce();
  });

  it.each(["csv", "json"] as const)("preserves %s bytes, attachment headers and the authenticated actor", async format => {
    const text = format === "csv" ? "Title\r\n'=SUM(A1)\r\n" : '[{"title":"Ω","price":10}]';
    const supplied = datasetSource([text], format);
    studios.a.runDatasets.streamRunDataset.mockResolvedValue(supplied.source);
    const response = await GET(routeRequest({ url: `${BASE_URL}?format=${format}&domainId=web-automation` }), params());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(supplied.source.contentType);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="fluxiq-dataset-run.one-listings.${format}"`);
    expect(await response.text()).toBe(text);
    expect(studios.a.runDatasets.streamRunDataset).toHaveBeenCalledWith({ projectId: "project.one", runId: "run.one", datasetId: "listings", format, actorId: "person-a" });
    expect(supplied.retire).toHaveBeenCalledOnce();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("decodes url ids once before lookup", async () => {
    const response = await GET(routeRequest({ url: BASE_URL }), params({ projectId: "project%2Eone", runId: "run%2Eone", datasetId: "listing%73" }));
    expect(response.status).toBe(200);
    expect(studios.a.runDatasets.streamRunDataset).toHaveBeenCalledWith({ projectId: "project.one", runId: "run.one", datasetId: "listings", format: "csv", actorId: "person-a" });
    await response.body!.cancel();
  });

  it("sanitizes attachment names and retires without reading an unused response", async () => {
    const supplied = datasetSource(["Name\r\n"], "csv", 'evil".csv\r\nX-Injected: 1');
    studios.a.runDatasets.streamRunDataset.mockResolvedValue(supplied.source);
    const response = await GET(routeRequest({ url: BASE_URL }), params());
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="evil_.csv__X-Injected__1"');
    expect(response.headers.get("X-Injected")).toBeNull();
    expect(runtime.releases.a).not.toHaveBeenCalled();
    await response.body!.cancel();
    expect(supplied.next).not.toHaveBeenCalled();
    expect(supplied.retire).toHaveBeenCalledOnce();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("sanitizes producer selection exceptions and releases the tenant", async () => {
    studios.a.runDatasets.streamRunDataset.mockRejectedValue(new Error("private dataset row at C:/tenant/store.sqlite"));
    const response = await GET(routeRequest({ url: BASE_URL }), params());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "The stream could not be prepared." });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });
});
