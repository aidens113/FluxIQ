import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FluxIQ } from "fluxiq";
const f = vi.hoisted(() => ({ tenancy: "multi", workspace: "tenant", currentUser: "owner", release: vi.fn(), migrate: vi.fn(), primaryMigrate: vi.fn(), acquire: vi.fn() }));
vi.mock("../../../lib/fluxiq", () => ({ getFluxIQWorkspaces: () => ({ tenancy: f.tenancy, acquire: f.acquire }) }));
vi.mock("../../../lib/workspaces", () => ({ sessionWorkspaceId: async () => f.workspace || null }));
vi.mock("../../provisioning-listener", () => ({ getPlatformServices: async () => ({}) }));
import { restoreLoginKeys } from "../restore-login-keys";
const input = { sessionId: "authenticated-session", userId: "owner", authorizationPassword: "fake-fixture-password", expiresAtMs: 10_000 };
function primary() {
  return { programs: { identityAccess: { validateSession: async () => ({ user: { id: f.currentUser } }) }, secretKeys: { unlockSession: f.primaryMigrate } } } as unknown as FluxIQ;
}
beforeEach(() => {
  vi.clearAllMocks();
  f.tenancy = "multi";
  f.workspace = "tenant";
  f.currentUser = "owner";
  f.migrate.mockResolvedValue(undefined);
  f.acquire.mockResolvedValue({ workspaceId: "tenant", release: f.release, fluxiq: { programs: { secretKeys: { unlockSession: f.migrate } } } });
});
describe("normal-login legacy key migration", () => {
  it("opens only the authenticated tenant and always releases its lease", async () => {
    await restoreLoginKeys(primary(), input);
    expect(f.acquire).toHaveBeenCalledWith("tenant");
    expect(f.migrate).toHaveBeenCalledWith({ ...input, passwordVerified: true });
    expect(f.primaryMigrate).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledTimes(1);
  });
  it("refuses authority changes after acquiring the tenant", async () => {
    f.currentUser = "other-user";
    await expect(restoreLoginKeys(primary(), input)).rejects.toThrow("authority changed");
    expect(f.migrate).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledTimes(1);
  });
  it("releases even when persisted key migration fails", async () => {
    f.migrate.mockRejectedValue(new Error("isolated store failure"));
    await expect(restoreLoginKeys(primary(), input)).rejects.toThrow("isolated store failure");
    expect(f.release).toHaveBeenCalledTimes(1);
  });
  it("preserves single-root login and does not use primary as a missing-tenant fallback", async () => {
    f.workspace = "";
    await restoreLoginKeys(primary(), input);
    expect(f.acquire).not.toHaveBeenCalled();
    expect(f.primaryMigrate).not.toHaveBeenCalled();
    f.tenancy = "single";
    await restoreLoginKeys(primary(), input);
    expect(f.primaryMigrate).toHaveBeenCalledWith({ ...input, passwordVerified: true });
  });
});
