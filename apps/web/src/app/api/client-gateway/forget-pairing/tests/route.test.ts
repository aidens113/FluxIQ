import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ forgotten: vi.fn(), ready: vi.fn(), release: vi.fn(), primary: {} }));
vi.mock("../../../../../server/browser-trust/teardown/runtime", () => ({
  holdCredentialTeardownRuntime: async () => ({ primary: fixture.primary, manager: { tenancy: "single" }, current: () => true, release: fixture.release })
}));
vi.mock("../../../../../server/browser-trust", () => ({ getBrowserTrustRepository: vi.fn() }));

import { POST } from "../route";

function forget(authorization?: string, cookie?: string): Promise<Response> {
  return POST(new Request("http://localhost/api/client-gateway/forget-pairing", {
    method: "POST", headers: { ...(authorization ? { authorization } : {}), ...(cookie ? { cookie } : {}) }
  }));
}

describe("POST /api/client-gateway/forget-pairing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fixture.primary = { programs: { clientGateway: { ready: fixture.ready, access: { forgetByCredential: fixture.forgotten } } } };
    fixture.forgotten.mockImplementation(async (proof: string) => proof === "synthetic-admin-proof" || proof === "synthetic-viewer-proof");
  });

  it("refuses with no credential", async () => {
    const response = await forget();
    expect(response.status).toBe(401);
    expect(fixture.forgotten).not.toHaveBeenCalled();
    expect(fixture.release).not.toHaveBeenCalled();
  });

  it.each(["admin", "viewer"])("ends a local %s client's own trust without live IAM", async role => {
    const response = await forget(`Bearer synthetic-${role}-proof`);
    expect(response.status).toBe(200);
    expect(fixture.forgotten).toHaveBeenCalledOnce();
    expect(fixture.ready).toHaveBeenCalledOnce();
    expect(fixture.release).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({ ok: true, payload: { forgotten: true } });
  });

  it("answers the same for one that speaks for nobody, so the browser can stop asking", async () => {
    const response = await forget("Bearer synthetic-unknown-proof");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, payload: { forgotten: false } });
  });

  it("refuses a cookie-only panel request", async () => {
    const response = await forget(undefined, "fluxiq_session=synthetic-panel-session");
    expect(response.status).toBe(401);
    expect(fixture.forgotten).not.toHaveBeenCalled();
    expect(fixture.release).not.toHaveBeenCalled();
  });

  it("does not fall back to a cookie when the bearer is invalid", async () => {
    const response = await forget("Bearer synthetic-unknown-proof", "fluxiq_session=synthetic-panel-session");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, payload: { forgotten: false } });
    expect(fixture.forgotten).toHaveBeenCalledOnce();
  });

  it("returns sanitized temporary failure rather than successful forgetting after a save fails", async () => {
    fixture.forgotten.mockRejectedValue(new Error("private database path and credential detail"));
    const response = await forget("Bearer synthetic-admin-proof");
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Client trust could not be removed. Please try again." });
    expect(fixture.release).toHaveBeenCalledOnce();
  });
});
