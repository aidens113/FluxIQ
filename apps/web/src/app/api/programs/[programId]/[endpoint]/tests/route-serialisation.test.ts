// Covers route.ts's answer path (t604): an answer that cannot be written as
// JSON is a 500 that says why, and the route goes on serving the next request.

import { beforeEach, describe, expect, it, vi } from "vitest";

const call = vi.fn();
const validateSession = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => ({ value: "authenticated-session" })) })),
}));

vi.mock("../../../../../../lib/fluxiq", () => ({
  getFluxIQ: () => ({
    programs: {
      api: { call, endpoints: vi.fn(() => []) },
      identityAccess: { validateSession, snapshot: vi.fn() },
      clientGateway: { authorizeToken: vi.fn() },
      automationStudio: { assertProjectDomainAccess: vi.fn() },
    },
  }),
  getFluxIQWebRuntimeStatus: vi.fn(),
}));

import { POST } from "../route";

function listing() {
  return POST(
    new Request("http://127.0.0.1/api/programs/automation-studio/list-runtime-sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: "project-1" }) }),
    { params: Promise.resolve({ programId: "automation-studio", endpoint: "list-runtime-sessions" }) },
  );
}

/** A payload `JSON.stringify` throws on as it did in `run-mv8mf0x5-95071c06`: too long for one string. */
const tooLong = { toJSON: () => { throw new RangeError("Invalid string length"); } };

describe("an answer the route cannot write as JSON", () => {
  beforeEach(() => {
    call.mockReset();
    validateSession.mockResolvedValue({ user: { id: "user:test" }, role: { id: "role:test", permissions: ["programs.read"] } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("is a 500 that says it was too large, and the next request is served", async () => {
    call.mockResolvedValueOnce({ ok: true, payload: { runtimeSessions: tooLong } });
    call.mockResolvedValueOnce({ ok: true, payload: { runtimeSessions: [] } });

    const failed = await listing();
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({ ok: false, errorCode: "response.too_large", error: expect.stringContaining("list-runtime-sessions was too large") });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("automation-studio/list-runtime-sessions"), expect.any(RangeError));

    const served = await listing();
    expect(served.status).toBe(200);
    expect(await served.json()).toEqual({ ok: true, payload: { runtimeSessions: [] } });
  });

  it("is a 500 naming it unserialisable when it is not a size failure", async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    call.mockResolvedValueOnce({ ok: true, payload: cyclic });

    const failed = await listing();
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({ ok: false, errorCode: "response.unserializable" });
  });
});
