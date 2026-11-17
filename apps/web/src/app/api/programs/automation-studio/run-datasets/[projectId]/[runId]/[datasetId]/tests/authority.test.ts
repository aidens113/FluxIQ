import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, registry, routeRequest, runtime } from "../../../../../../../../../lib/workspaces/routes/tests/route-runtime";
import { BASE_URL, changeAuthority, params, resetDatasetRuntime, studios } from "./route-runtime";

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

describe("current dataset stream authority", () => {
  it.each(["session", "membership", "selection", "account", "user", "identity", "iam"])("drops a pending row after current %s loss without reselecting a tenant", async change => {
    const reading = deferred<IteratorResult<string, unknown>>();
    const entered = deferred();
    sources.a.next.mockImplementationOnce(() => {
      entered.resolve();
      return reading.promise;
    });
    const response = await GET(routeRequest({ url: BASE_URL }), params());
    const pendingRead = response.body!.getReader().read();
    await entered.promise;
    expect(runtime.releases.a).not.toHaveBeenCalled();
    await changeAuthority(change);
    reading.resolve({ done: false, value: "private row that must not be delivered" });
    await expect(pendingRead).rejects.toMatchObject({ code: "workspace_stream.authority_lost", refusal: { status: change === "iam" ? 403 : 401 } });
    expect(runtime.manager.acquire.mock.calls).toEqual([["tenant-a"]]);
    expect(studios.primary.runDatasets.streamRunDataset).not.toHaveBeenCalled();
    expect(studios.b.runDatasets.streamRunDataset).not.toHaveBeenCalled();
    expect(sources.a.retire).toHaveBeenCalledOnce();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).not.toHaveBeenCalled();
  });

  it.each(["local", "self-hosted"] as const)("drops a pending row after current role permission loss under %s", async profile => {
    runtime.manager.tenancy = "single";
    runtime.primary.programs.api = registry("workspace-main", profile);
    const reading = deferred<IteratorResult<string, unknown>>();
    const entered = deferred();
    sources.primary.next.mockImplementationOnce(() => {
      entered.resolve();
      return reading.promise;
    });
    const response = await GET(routeRequest({ url: BASE_URL }), params());
    const pendingRead = response.body!.getReader().read();
    await entered.promise;
    await changeAuthority("role");
    reading.resolve({ done: false, value: "private row after permission removal" });
    await expect(pendingRead).rejects.toMatchObject({ code: "workspace_stream.authority_lost", refusal: { status: 403 } });
    expect(sources.primary.retire).toHaveBeenCalledOnce();
    expect(runtime.releases.primary).toHaveBeenCalledOnce();
  });

  it("refuses revoked authority before starting an unread producer", async () => {
    const response = await GET(routeRequest({ url: BASE_URL }), params());
    await changeAuthority("session");
    await expect(response.text()).rejects.toMatchObject({ code: "workspace_stream.authority_lost", refusal: { status: 401 } });
    expect(sources.a.next).not.toHaveBeenCalled();
    expect(sources.a.retire).toHaveBeenCalledOnce();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("checks domain access again after a pending read before publishing its row", async () => {
    const reading = deferred<IteratorResult<string, unknown>>();
    const entered = deferred();
    sources.a.next.mockImplementationOnce(() => {
      entered.resolve();
      return reading.promise;
    });
    const response = await GET(routeRequest({ url: `${BASE_URL}?domainId=domain-a` }), params());
    const pendingRead = response.body!.getReader().read();
    await entered.promise;
    studios.a.assertProjectDomainAccess.mockRejectedValue(new Error("private project moved to another domain"));
    reading.resolve({ done: false, value: "private moved project row" });
    await expect(pendingRead).rejects.toMatchObject({ code: "workspace_stream.authority_lost", refusal: { status: 404, error: "Run dataset was not found or is not available." } });
    expect(sources.a.retire).toHaveBeenCalledOnce();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["domain", "producer", "missing-producer"])("revalidates authority after awaiting %s selection before handoff", async stage => {
    const gate = deferred();
    const entered = deferred();
    if (stage === "domain") studios.a.assertProjectDomainAccess.mockImplementationOnce(async () => {
      entered.resolve();
      await gate.promise;
    });
    else studios.a.runDatasets.streamRunDataset.mockImplementationOnce(async () => {
      entered.resolve();
      await gate.promise;
      return stage === "missing-producer" ? null : sources.a.source;
    });
    const pendingResponse = GET(routeRequest({ url: BASE_URL }), params());
    await entered.promise;
    await changeAuthority("session");
    gate.resolve();
    const response = await pendingResponse;
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Authentication required" });
    expect(sources.a.next).not.toHaveBeenCalled();
    expect(sources.a.retire).toHaveBeenCalledTimes(stage === "producer" ? 1 : 0);
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.manager.acquire.mock.calls).toEqual([["tenant-a"]]);
  });

  it("retires a selected producer when its domain grant is lost before handoff", async () => {
    studios.a.runDatasets.streamRunDataset.mockImplementationOnce(async () => {
      studios.a.assertProjectDomainAccess.mockRejectedValue(new Error("private domain change"));
      return sources.a.source;
    });
    const response = await GET(routeRequest({ url: BASE_URL }), params());
    expect(response.status).toBe(404);
    expect(sources.a.next).not.toHaveBeenCalled();
    expect(sources.a.retire).toHaveBeenCalledOnce();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("fails closed and sanitizes a current IAM store failure after a read", async () => {
    sources.a.next.mockImplementationOnce(async () => {
      runtime.policyError = true;
      return { done: false, value: "private row" };
    });
    const response = await GET(routeRequest({ url: BASE_URL }), params());
    const error = await response.text().catch((failure: unknown) => failure);
    expect(error).toMatchObject({ code: "workspace_stream.authority_lost", refusal: { status: 503, error: "Request authority could not be verified." } });
    expect(JSON.stringify(error)).not.toMatch(/private|database|path/u);
    expect(sources.a.retire).toHaveBeenCalledOnce();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("does not start a producer after revocation while its actual IAM decision is pending", async () => {
    const response = await GET(routeRequest({ url: BASE_URL }), params());
    const entered = deferred();
    const gate = deferred();
    const authorize = runtime.tenantA.programs.api.authorize.bind(runtime.tenantA.programs.api);
    vi.spyOn(runtime.tenantA.programs.api, "authorize").mockImplementationOnce(async input => {
      const decision = await authorize(input);
      entered.resolve();
      await gate.promise;
      return decision;
    });
    const pendingRead = response.body!.getReader().read();
    await entered.promise;
    await changeAuthority("session");
    gate.resolve();
    await expect(pendingRead).rejects.toMatchObject({ code: "workspace_stream.authority_lost", refusal: { status: 401 } });
    expect(sources.a.next).not.toHaveBeenCalled();
    expect(sources.a.retire).toHaveBeenCalledOnce();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("retires a late producer after request abort during dataset selection", async () => {
    const controller = new AbortController();
    const entered = deferred();
    const gate = deferred();
    studios.a.runDatasets.streamRunDataset.mockImplementationOnce(async () => {
      entered.resolve();
      await gate.promise;
      return sources.a.source;
    });
    const pendingResponse = GET(routeRequest({ url: BASE_URL, signal: controller.signal }), params());
    await entered.promise;
    controller.abort(new Error("private caller abort cause"));
    expect(runtime.releases.a).not.toHaveBeenCalled();
    gate.resolve();
    const response = await pendingResponse;
    expect(response.status).toBe(401);
    expect(sources.a.next).not.toHaveBeenCalled();
    expect(sources.a.retire).toHaveBeenCalledOnce();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("retains the tenant until a real async generator's queued cancellation finishes", async () => {
    const entered = deferred();
    const gate = deferred();
    const returned = deferred();
    const events: string[] = [];
    const iterator = (async function* () {
      try {
        entered.resolve();
        await gate.promise;
        yield "late private row";
      } finally {
        events.push("producer-closed");
      }
    })();
    const originalReturn = iterator.return.bind(iterator);
    const returnSpy = vi.spyOn(iterator, "return").mockImplementation(value => {
      returned.resolve();
      return originalReturn(value);
    });
    studios.a.runDatasets.streamRunDataset.mockResolvedValue({ format: "csv", fileName: "rows.csv", contentType: "text/csv", [Symbol.asyncIterator]: () => iterator });
    runtime.releases.a.mockImplementation(() => { events.push("tenant-released"); });
    const response = await GET(routeRequest({ url: BASE_URL }), params());
    const reader = response.body!.getReader();
    const reading = reader.read();
    await entered.promise;
    const cancellation = reader.cancel();
    await returned.promise;
    expect(events).toEqual([]);
    expect(runtime.releases.a).not.toHaveBeenCalled();
    gate.resolve();
    await cancellation;
    expect(await reading).toEqual({ done: true, value: undefined });
    expect(events).toEqual(["producer-closed", "tenant-released"]);
    expect(returnSpy).toHaveBeenCalledOnce();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });
});
