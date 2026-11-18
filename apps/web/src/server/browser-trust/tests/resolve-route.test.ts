import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientTrustBinding, ClientTrustCredentialProof } from "fluxiq/platform";
import type { WorkspaceLease } from "../../../lib/workspaces";
import { resolveTrustedClientRoute } from "../resolve-route";

const binding: ClientTrustBinding = { workspaceId: "tenant-one", trustedClientId: "trust-one", approvedByUserId: "person-one", clientId: "installation-one", clientType: "extension", domainId: "test-domain" };
const gateway = {} as WorkspaceLease["fluxiq"]["programs"]["clientGateway"];
const release = vi.fn();
const lookupCredential = vi.fn<() => Promise<ClientTrustCredentialProof>>();
const authorize = vi.fn<() => Promise<boolean>>();
const acquire = vi.fn<() => Promise<WorkspaceLease>>();
const deps = { repository: { lookupCredential }, primaryWorkspaceId: "workspace-main", authorize, acquire };
const hello = { token: "synthetic-proof", clientId: "installation-one", clientType: "extension" as const, metadata: { domainId: "test-domain" } };

beforeEach(() => {
  vi.resetAllMocks();
  lookupCredential.mockResolvedValue({ status: "current", binding });
  authorize.mockResolvedValue(true);
  acquire.mockResolvedValue({ workspaceId: binding.workspaceId, fluxiq: { programs: { clientGateway: gateway } } as WorkspaceLease["fluxiq"], release });
});

describe("authoritative client workspace selection", () => {
  it("selects only the proved workspace and retains its lease until the socket releases it", async () => {
    const route = await resolveTrustedClientRoute({ hello, signal: new AbortController().signal }, deps);
    expect(acquire).toHaveBeenCalledWith("tenant-one");
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(route?.gateway).toBe(gateway);
    expect(release).not.toHaveBeenCalled();
    route?.release();
    expect(release).toHaveBeenCalledOnce();
  });
  it.each(["invalid", "inactive"] as const)("refuses %s proof before any tenant acquisition", async (status) => {
    lookupCredential.mockResolvedValue(status === "invalid" ? { status, reason: "forged" } : { status, reason: "revoked", binding });
    expect(await resolveTrustedClientRoute({ hello, signal: new AbortController().signal }, deps)).toBeNull();
    expect(authorize).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
  });
  it.each([{ ...binding, workspaceId: "workspace-main" }, { ...binding, clientId: "other" }, { ...binding, clientType: "worker" as const }, { ...binding, domainId: "other" }])("refuses conflicting binding %j", async (changed) => {
    lookupCredential.mockResolvedValue({ status: "current", binding: changed });
    expect(await resolveTrustedClientRoute({ hello, signal: new AbortController().signal }, deps)).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
  });
  it("routes signed obsolete credentials only to their owner for gateway reuse handling", async () => {
    lookupCredential.mockResolvedValue({ status: "obsolete", binding, reuse: "revoke" });
    const route = await resolveTrustedClientRoute({ hello, signal: new AbortController().signal }, deps);
    expect(route?.gateway).toBe(gateway);
    route?.release();
  });
  it("refuses disabled or removed authority before opening storage", async () => {
    authorize.mockResolvedValue(false);
    expect(await resolveTrustedClientRoute({ hello, signal: new AbortController().signal }, deps)).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
  });
  it("releases acquisition when authority ends while the tenant opens", async () => {
    authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await resolveTrustedClientRoute({ hello, signal: new AbortController().signal }, deps)).toBeNull();
    expect(release).toHaveBeenCalledOnce();
  });
  it("releases a lease acquired after the socket has closed", async () => {
    const controller = new AbortController();
    acquire.mockImplementation(async () => {
      controller.abort();
      return { workspaceId: binding.workspaceId, fluxiq: { programs: { clientGateway: gateway } } as WorkspaceLease["fluxiq"], release };
    });
    expect(await resolveTrustedClientRoute({ hello, signal: controller.signal }, deps)).toBeNull();
    expect(release).toHaveBeenCalledOnce();
  });
  it("releases the tenant if authority lookup throws after opening", async () => {
    authorize.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("authority unavailable"));
    await expect(resolveTrustedClientRoute({ hello, signal: new AbortController().signal }, deps)).rejects.toThrow("authority unavailable");
    expect(release).toHaveBeenCalledOnce();
  });
});
