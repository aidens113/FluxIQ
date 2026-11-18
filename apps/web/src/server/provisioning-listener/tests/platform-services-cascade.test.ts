import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PlatformServicesOptions } from "fluxiq/platform";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The web server's platform composition wires every cascade port into
// provisioning, and starts the deletion sweep, which stops before the stores
// close. The FluxIQ instance and the workspace manager are stand-ins; the
// platform services' own construction is observed, not run.

const runtime = vi.hoisted(() => ({
  root: "",
  fluxiq: null as unknown as { paths: Record<string, string>; programs: Record<string, unknown> },
  manager: { tenancy: "multi", primaryWorkspaceId: "workspace-main", dropUserCustody: () => 0 },
  options: null as PlatformServicesOptions | null,
  sweeps: 0
}));

vi.mock("../../../lib/fluxiq", () => ({
  getFluxIQAfterReload: async () => runtime.fluxiq,
  getFluxIQWorkspaces: () => runtime.manager,
  isCurrentFluxIQPrimary: (instance: unknown) => instance === runtime.fluxiq
}));
vi.mock("../../../lib/workspaces", () => ({ primaryWorkspaceId: () => "workspace-main" }));
vi.mock("../../key-sessions", () => ({ closeKeySessionServices: async () => undefined }));
vi.mock("../../connect", () => ({ closeConnectServices: async () => undefined }));
vi.mock("../../browser-trust", () => ({ closeBrowserTrustRepository: async () => undefined, getBrowserTrustRepository: () => ({ listActiveForUser: async () => [] }) }));
vi.mock("../../commerce", () => ({ getCommerceBilling: async () => null }));
vi.mock("fluxiq/database-manager", () => ({ SQLiteRepository: class { constructor(readonly options: unknown) {} } }));
vi.mock("fluxiq/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("fluxiq/platform")>()),
  createPlatformServices: async (options: PlatformServicesOptions) => {
    runtime.options = options;
    const runDueDeletions = async () => {
      runtime.sweeps += 1;
      return 0;
    };
    return { store: {}, provisioning: { runDueDeletions }, links: {}, workspaceIam: () => ({}), provisionerCaller: () => ({}) };
  }
}));

import { closePlatformServices, getPlatformServices } from "../platform-services";

type Primary = Parameters<typeof closePlatformServices>[0];

beforeEach(async () => {
  runtime.root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-platform-composition-"));
  runtime.fluxiq = { paths: { fluxiq: runtime.root, config: path.join(runtime.root, "config.json"), databases: path.join(runtime.root, "databases"), root: runtime.root }, programs: { identityAccess: {}, clientGateway: {} } };
  runtime.options = null;
  runtime.sweeps = 0;
  vi.stubEnv("FLUXIQ_PROFILE", "service");
  vi.stubEnv("FLUXIQ_PUBLIC_ORIGIN", "https://app.example.test");
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await rm(runtime.root, { recursive: true, force: true });
});

describe("the platform composition", () => {
  it("wires every cascade port into provisioning", async () => {
    await getPlatformServices();
    const options = runtime.options;
    if (options === null) throw new Error("the platform services were not composed");
    for (const port of ["revokeConnectedClients", "dropWorkspaceCustody", "closeBilling", "purgeEnvironments", "deleteWorkspaceData"] as const) {
      expect([port, typeof options[port]]).toEqual([port, "function"]);
    }
    // Nothing is billed here, and no environment controller is composed: both steps are no-ops, never failures.
    await expect(options.closeBilling!("account-a", "receipt-a")).resolves.toBeUndefined();
    await expect(options.purgeEnvironments!({ accountId: "account-a", workspaceIds: [], operationId: "receipt-a" })).resolves.toBeUndefined();
    await closePlatformServices(runtime.fluxiq as unknown as Primary);
  });

  it("runs the deletion sweep every five minutes, and stops it on close", async () => {
    await getPlatformServices();
    expect(runtime.sweeps).toBe(0);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(runtime.sweeps).toBe(1);
    await closePlatformServices(runtime.fluxiq as unknown as Primary);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(runtime.sweeps).toBe(1);
  });
});
