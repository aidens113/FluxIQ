import { vi } from "vitest";

vi.mock("../../../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../../../lib/workspaces/routes/tests/route-runtime");
  const { traceRuntime } = await import("./trace-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getFluxIQWebRuntimeStatus: () => { throw new Error("Unexpected primary presentation"); }, isCurrentFluxIQPrimary: (instance: unknown) => traceRuntime.primaryCurrent && instance === runtime.primary };
});
vi.mock("../../../../../../server/provisioning-listener", async () => {
  const { runtime } = await import("../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getPlatformServices: async () => ({ store: runtime.store }) };
});
vi.mock("../../../../../../server/browser-trust", async () => {
  const { runtime } = await import("../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { resolveServiceClientHttpRoute: runtime.resolveBrowser };
});
vi.mock("../guard", async importOriginal => {
  const original = await importOriginal<typeof import("../guard")>();
  const { traceRuntime } = await import("./trace-runtime");
  return { createTraceUploadGuard: (...args: Parameters<typeof original.createTraceUploadGuard>) => {
    const guard = original.createTraceUploadGuard(...args);
    return { ...guard, stillAuthorized: async () => {
      const admitted = await guard.stillAuthorized();
      if (admitted) traceRuntime.afterAuthorization?.();
      return admitted;
    } };
  } };
});
