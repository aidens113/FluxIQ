import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ cookie: undefined as string | undefined, endpoints: vi.fn(), select: vi.fn(), handle: vi.fn(), release: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.cookie ? { value: state.cookie } : undefined }) }));
vi.mock("../../../../../../lib/fluxiq", () => ({ getFluxIQWorkspaces: () => ({ tenancy: "multi", primary: () => ({ fluxiq: { programs: { api: { endpoints: state.endpoints } } } }) }) }));
vi.mock("../../../../../../lib/workspaces", () => ({ workspaceProgramContext: state.select }));
vi.mock("fluxiq/server", async (original) => ({ ...await original<typeof import("fluxiq/server")>(), handleProgramRequest: state.handle }));
import { POST } from "../route";

beforeEach(() => {
  vi.resetAllMocks();
  state.cookie = undefined;
  state.endpoints.mockReturnValue([{ programId: "automation-studio", endpoint: "list-conversations", classification: "read" }]);
  state.select.mockResolvedValue({ context: { fluxiq: "synthetic-tenant" }, sessionId: undefined, authorization: "Bearer synthetic-browser", release: state.release });
  state.handle.mockResolvedValue({ status: 200, headers: { "content-type": "application/json" }, body: "{}" });
});
function invoke(endpoint = "list-conversations") {
  const request = new Request(`https://panel.example.test/api/programs/automation-studio/${endpoint}`, { method: "POST", headers: { authorization: "Bearer synthetic-browser" }, body: "{}" });
  return POST(request, { params: Promise.resolve({ programId: "automation-studio", endpoint }) });
}
describe("hosted program route channel selection", () => {
  it.each(["unavailable-endpoint", "list-conversations"])("refuses unavailable name or classification before tenant lookup: %s", async (endpoint) => {
    state.endpoints.mockReturnValue([]);
    expect((await invoke(endpoint)).status).toBe(403);
    expect(state.select).not.toHaveBeenCalled();
    expect(state.handle).not.toHaveBeenCalled();
  });
  it("forwards only the selected browser channel and releases after the buffered answer", async () => {
    expect((await invoke()).status).toBe(200);
    expect(state.handle).toHaveBeenCalledWith(expect.objectContaining({ sessionId: undefined, authorization: "Bearer synthetic-browser" }), { fluxiq: "synthetic-tenant" });
    expect(state.release).toHaveBeenCalledOnce();
  });
  it("a cookie selection ignores the bearer even when it names a different customer", async () => {
    state.cookie = "synthetic-panel";
    state.select.mockResolvedValue({ context: { fluxiq: "panel-tenant" }, sessionId: state.cookie, authorization: null, release: state.release });
    expect((await invoke("panel-only-endpoint")).status).toBe(200);
    expect(state.endpoints).not.toHaveBeenCalled();
    expect(state.handle).toHaveBeenCalledWith(expect.objectContaining({ sessionId: state.cookie, authorization: null }), { fluxiq: "panel-tenant" });
  });
  it("does not retry a refused cookie selection as bearer", async () => {
    state.cookie = "expired-panel";
    state.select.mockResolvedValue(null);
    expect((await invoke()).status).toBe(401);
    expect(state.select).toHaveBeenCalledOnce();
    expect(state.handle).not.toHaveBeenCalled();
  });
  it("releases even when the handler fails", async () => {
    state.handle.mockRejectedValue(new Error("Synthetic handler failure"));
    await expect(invoke()).rejects.toThrow("Synthetic handler failure");
    expect(state.release).toHaveBeenCalledOnce();
  });
});
