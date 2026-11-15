import { beforeEach, describe, expect, it, vi } from "vitest";
import { runtime } from "../../../../../../../../lib/workspaces/routes/tests/route-runtime";
import { assetParams, assetRequest, assets, pairedAssetRequest, PNG_A, resetAssetRuntime, SHA_A } from "./asset-runtime";
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

describe("Core state-asset upload validation through selected routing", () => {
  it.each(["digest", "media", "declared-size"])("preserves pre-body %s validation and releases the lease", async kind => {
    const sha256 = kind === "digest" ? "bad-digest" : SHA_A;
    const request = pairedAssetRequest({ sha256, headers: kind === "media" ? { "content-type": "text/plain" } : kind === "declared-size" ? { "content-length": String(20 * 1024 * 1024 + 1) } : {} });
    const read = vi.spyOn(request, "arrayBuffer");
    const response = await PUT(request, assetParams("same-project", sha256));
    expect(response.status).toBe(kind === "digest" ? 400 : kind === "media" ? 415 : 413);
    expect(read).not.toHaveBeenCalled();
    expect(assets.a.write).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["empty", "actual-size"])("preserves Core's actual %s body validation", async kind => {
    const bytes = new Uint8Array(kind === "empty" ? 0 : 20 * 1024 * 1024 + 1);
    const request = pairedAssetRequest({ bytes, headers: { "content-length": "1" } });
    const response = await PUT(request, assetParams());
    expect(response.status).toBe(kind === "empty" ? 400 : 413);
    expect(assets.a.write).not.toHaveBeenCalled();
    expect(assets.a.trace).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("normalizes allowed media/digest values and forwards the original image bytes", async () => {
    const response = await PUT(pairedAssetRequest({ sha256: SHA_A.toUpperCase(), headers: { "content-type": "IMAGE/PNG; charset=binary" } }), assetParams("same-project", SHA_A.toUpperCase()));
    expect(response.status).toBe(201);
    expect(assets.a.write).toHaveBeenCalledWith(expect.objectContaining({ mediaType: "image/png", expectedSha256: SHA_A }));
    expect(new Uint8Array(assets.a.write.mock.calls[0]?.[0].content)).toEqual(PNG_A);
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each([
    ["Automation Studio state asset digest does not match the requested object digest.", 409],
    ["Automation Studio object storage is not enabled.", 503],
    ["Synthetic recording validation refusal", 400]
  ] as const)("retains Core's write-error mapping: %s", async (message, status) => {
    assets.a.write.mockRejectedValueOnce(new Error(message));
    const response = await PUT(pairedAssetRequest(), assetParams());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: false, error: message });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("sanitizes an unexpected body read error, releases once and never writes", async () => {
    const request = assetRequest();
    vi.spyOn(request, "arrayBuffer").mockRejectedValueOnce(new Error("Synthetic private request state"));
    const response = await PUT(request, assetParams());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "State asset upload could not be completed." });
    expect(assets.a.write).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("refuses an already-aborted upload without acquisition or storage", async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await PUT(assetRequest({ signal: controller.signal }), assetParams())).status).toBe(401);
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(assets.a.write).not.toHaveBeenCalled();
    expect(runtime.releases.a).not.toHaveBeenCalled();
  });
});
