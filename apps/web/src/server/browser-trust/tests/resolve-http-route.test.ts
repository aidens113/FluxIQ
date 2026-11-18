import type { ClientTrustBinding } from "fluxiq/platform";
import type { WorkspaceLease } from "../../../lib/workspaces";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveTrustedClientHttpRoute } from "../resolve-http-route";

const binding: ClientTrustBinding = { workspaceId: "tenant-a", trustedClientId: "trust-a", approvedByUserId: "person-a", clientId: "installation-a", clientType: "extension", domainId: "web" };
const lookupCredential = vi.fn();
const authorize = vi.fn();
const acquire = vi.fn();
const release = vi.fn();
const lease = { workspaceId: "tenant-a", fluxiq: {}, release } as unknown as WorkspaceLease;
const deps = { repository: { lookupCredential }, primaryWorkspaceId: "workspace-main", authorize, acquire };
beforeEach(() => {
  vi.resetAllMocks();
  lookupCredential.mockResolvedValue({ status: "current", binding });
  authorize.mockResolvedValue(true);
  acquire.mockResolvedValue(lease);
});

describe("ordinary browser HTTP tenant proof", () => {
  it.each(["current", "previous", "obsolete"])("routes %s proof but leaves actual gateway authorization to the handler", async (status) => {
    lookupCredential.mockResolvedValue({ status, binding, reuse: "request-in-flight" });
    const selected = await resolveTrustedClientHttpRoute("synthetic-token", deps);
    expect(selected?.lease).toBe(lease);
    expect(lookupCredential).toHaveBeenCalledWith("synthetic-token", { request: true });
    expect(acquire).toHaveBeenCalledOnce();
    expect(acquire).toHaveBeenCalledWith("tenant-a");
    expect(release).not.toHaveBeenCalled();
    selected?.lease.release();
    expect(release).toHaveBeenCalledOnce();
  });
  it.each(["invalid", "inactive"])("refuses %s proof before opening storage", async (status) => {
    lookupCredential.mockResolvedValue({ status, binding });
    expect(await resolveTrustedClientHttpRoute("synthetic-token", deps)).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
  });
  it.each([
    { ...binding, workspaceId: "workspace-main" },
    { ...binding, managedHost: { hostId: "host-a", profile: "web" } }
  ])("refuses primary and managed authority without a human fallback", async (refused) => {
    lookupCredential.mockResolvedValue({ status: "current", binding: refused });
    expect(await resolveTrustedClientHttpRoute("synthetic-token", deps)).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
  });
  it("refuses inactive account or membership before acquiring", async () => {
    authorize.mockResolvedValue(false);
    expect(await resolveTrustedClientHttpRoute("synthetic-token", deps)).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
  });
  it("releases if authority changes while acquiring", async () => {
    authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await resolveTrustedClientHttpRoute("synthetic-token", deps)).toBeNull();
    expect(release).toHaveBeenCalledOnce();
  });
  it("never follows a credential rebound to a different tenant", async () => {
    lookupCredential.mockResolvedValueOnce({ status: "current", binding }).mockResolvedValue({ status: "current", binding: { ...binding, workspaceId: "tenant-b" } });
    expect(await resolveTrustedClientHttpRoute("synthetic-token", deps)).toBeNull();
    expect(acquire).toHaveBeenCalledOnce();
    expect(acquire).toHaveBeenCalledWith("tenant-a");
    expect(release).toHaveBeenCalledOnce();
  });
  it("releases on a post-acquisition storage error", async () => {
    lookupCredential.mockResolvedValueOnce({ status: "current", binding }).mockRejectedValueOnce(new Error("Synthetic lookup failure"));
    await expect(resolveTrustedClientHttpRoute("synthetic-token", deps)).rejects.toThrow("Synthetic lookup failure");
    expect(release).toHaveBeenCalledOnce();
  });
  it("a later guard refuses revocation without acquiring a different workspace", async () => {
    const selected = await resolveTrustedClientHttpRoute("synthetic-token", deps);
    lookupCredential.mockResolvedValue({ status: "inactive", binding, reason: "revoked" });
    expect(await selected?.revalidateAuthority()).toBe(false);
    expect(acquire).toHaveBeenCalledOnce();
    selected?.lease.release();
  });
});
