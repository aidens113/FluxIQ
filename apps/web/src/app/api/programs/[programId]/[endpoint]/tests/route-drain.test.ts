// While the server drains, the program route refuses a call that starts a
// build or run, before the handler runs; reads and stops still go through.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drainState } from "../../../../../../server/drain";

const call = vi.fn();
const validateSession = vi.fn();
const snapshot = vi.fn();
const authorizeToken = vi.fn();
const endpoints = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => ({ value: "session-1" })) })),
}));

vi.mock("../../../../../../lib/fluxiq", () => ({
  getFluxIQ: () => ({
    programs: {
      api: { call, endpoints },
      identityAccess: { validateSession, snapshot },
      clientGateway: { authorizeToken },
      automationStudio: {},
    },
  }),
  getFluxIQWebRuntimeStatus: vi.fn(),
}));

import { GET, POST } from "../route";

const context = (endpoint: string) => ({ params: Promise.resolve({ programId: "automation-studio", endpoint }) });
const post = (endpoint: string) =>
  POST(new Request(`http://localhost/api/programs/automation-studio/${endpoint}`, { method: "POST", body: "{}" }), context(endpoint));

beforeEach(() => {
  call.mockReset().mockResolvedValue({ ok: true, payload: {} });
  validateSession.mockReset().mockResolvedValue({ user: { id: "u1" }, role: { id: "r1", permissions: [] } });
});
afterEach(() => drainState.reset());

describe("program route while draining", () => {
  it("refuses a start endpoint with 503, a code and Retry-After, without calling the handler", async () => {
    drainState.markDraining();
    const response = await post("start-runtime-session");
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.json()).toMatchObject({ ok: false, errorCode: "server.draining" });
    expect(call).not.toHaveBeenCalled();
  });

  it("lets a read and a stop through", async () => {
    drainState.markDraining();
    const read = await GET(new Request("http://localhost/api/programs/automation-studio/get-runtime-session"), context("get-runtime-session"));
    expect(read.status).toBe(200);
    expect((await post("cancel-runtime-session")).status).toBe(200);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("refuses nothing when not draining", async () => {
    expect((await post("start-runtime-session")).status).toBe(200);
    expect(call).toHaveBeenCalledTimes(1);
  });
});
