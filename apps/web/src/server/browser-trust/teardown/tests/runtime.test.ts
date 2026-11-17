import { beforeEach, describe, expect, it, vi } from "vitest";
import { holdCredentialTeardownRuntime } from "../runtime";

const state = vi.hoisted(() => ({ primary: {}, manager: {} as Record<string, unknown>, afterReload: vi.fn(), acquire: vi.fn(), release: vi.fn(), current: true }));
vi.mock("../../../../lib/fluxiq", () => ({
  getFluxIQAfterReload: state.afterReload,
  getFluxIQWorkspaces: () => state.manager,
  isCurrentFluxIQPrimary: (primary: unknown) => state.current && primary === state.primary
}));
beforeEach(() => {
  vi.resetAllMocks();
  state.current = true;
  state.manager = { primaryWorkspaceId: "workspace-main", acquire: state.acquire };
  state.afterReload.mockResolvedValue(state.primary);
  state.acquire.mockResolvedValue({ fluxiq: state.primary, release: state.release });
});

describe("pinned credential teardown runtime", () => {
  it("retains the exact primary lease and manager without selecting again", async () => {
    const runtime = await holdCredentialTeardownRuntime();
    expect(runtime.primary).toBe(state.primary);
    expect(runtime.manager).toBe(state.manager);
    expect(runtime.current()).toBe(true);
    expect(state.afterReload).toHaveBeenCalledOnce();
    expect(state.acquire).toHaveBeenCalledWith("workspace-main");
    expect(state.release).not.toHaveBeenCalled();
    runtime.release();
    expect(state.release).toHaveBeenCalledOnce();
  });

  it("does not acquire after primary retirement in the initial continuation", async () => {
    state.afterReload.mockImplementation(async () => {
      queueMicrotask(() => { state.current = false; });
      return state.primary;
    });
    await expect(holdCredentialTeardownRuntime()).rejects.toThrow("no longer current");
    expect(state.acquire).not.toHaveBeenCalled();
  });

  it.each(["primary", "manager", "lease"])("releases an unpublished lease when %s changes while acquiring", async change => {
    state.acquire.mockImplementation(async () => {
      if (change === "primary") state.current = false;
      if (change === "manager") state.manager = {};
      return { fluxiq: change === "lease" ? {} : state.primary, release: state.release };
    });
    await expect(holdCredentialTeardownRuntime()).rejects.toThrow("no longer current");
    expect(state.release).toHaveBeenCalledOnce();
  });
});
