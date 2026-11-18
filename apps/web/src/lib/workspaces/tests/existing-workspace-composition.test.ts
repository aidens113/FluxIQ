import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeFluxIQWebRuntime, getFluxIQWorkspaces, initializeFluxIQWebRuntime, isCurrentFluxIQPrimary } from "../../fluxiq";
import "../../../server/provisioning-listener";

vi.mock("../../../server/owner-claim", () => ({ prepareOwnerClaim: async () => ({ claimed: false, codeFile: "/unused-test-claim" }) }));
const state = globalThis as typeof globalThis & { __fluxiqWebRuntime?: unknown; __fluxiqWebHostModule?: unknown };
const roots: string[] = [];

afterEach(async () => {
  await closeFluxIQWebRuntime();
  delete state.__fluxiqWebRuntime;
  delete state.__fluxiqWebHostModule;
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function configure() {
  const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-existing-composition-"));
  roots.push(root);
  vi.stubEnv("FLUXIQ_IMPORTER_ROOT", root);
  vi.stubEnv("FLUXIQ_PROFILE", "service");
  vi.stubEnv("FLUXIQ_PUBLIC_ORIGIN", "https://panel.example.test");
  vi.stubEnv("FLUXIQ_CLIENT_GATEWAY_ENABLED", "false");
  vi.stubEnv("FLUXIQ_MODEL_PROVIDERS_ENABLED", "false");
  for (const key of ["FLUXIQ_PROVISIONING_LISTEN", "FLUXIQ_PROVISIONING_TOKEN_FILE", "FLUXIQ_HOST_MODULE", "FLUXIQ_DOMAIN_ID", "FLUXIQ_HOST_DOMAIN", "FLUXIQ_WORKSPACE_ID"]) vi.stubEnv(key, "");
  delete state.__fluxiqWebRuntime;
}

describe("existing-only tenant runtime composition", () => {
  it("opens a cold persisted tenant through the actual existing-only factory after restart", async () => {
    configure();
    await initializeFluxIQWebRuntime();
    const first = await getFluxIQWorkspaces().acquire("existing-tenant");
    const root = first.fluxiq.paths.root;
    first.release();
    await closeFluxIQWebRuntime();
    delete state.__fluxiqWebRuntime;
    const primary = await initializeFluxIQWebRuntime();
    const manager = getFluxIQWorkspaces();
    expect(manager.get("existing-tenant")).toBeUndefined();
    const lease = await manager.acquireExisting("existing-tenant", { exists: async () => true, current: () => isCurrentFluxIQPrimary(primary) });
    expect(lease).not.toBeNull();
    expect(lease!.fluxiq.paths.root).toBe(root);
    expect(lease!.fluxiq).not.toBe(primary);
    lease!.release();
  });

  it("cannot recreate a deleted physical root even when the catalog callback still says it exists", async () => {
    configure();
    const primary = await initializeFluxIQWebRuntime();
    const manager = getFluxIQWorkspaces();
    const first = await manager.acquire("deleted-tenant");
    const root = first.fluxiq.paths.root;
    first.release();
    await manager.deleteWorkspace("deleted-tenant");
    expect(existsSync(root)).toBe(false);
    const lease = await manager.acquireExisting("deleted-tenant", { exists: async () => true, current: () => isCurrentFluxIQPrimary(primary) });
    expect(lease).toBeNull();
    expect(existsSync(root)).toBe(false);
    expect(manager.get("deleted-tenant")).toBeUndefined();
  });
});
