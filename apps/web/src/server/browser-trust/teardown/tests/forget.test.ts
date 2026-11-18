import type { FluxIQ } from "fluxiq";
import type { ClientTrustCredentialProof } from "fluxiq/platform";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { forgetClientCredential } from "../index";
import type { CredentialTeardownRuntime } from "../types";

const state = vi.hoisted(() => ({
  proof: vi.fn(), repository: vi.fn(), store: vi.fn(), platform: vi.fn(), hold: vi.fn(),
  acquire: vi.fn(), revoke: vi.fn(), release: vi.fn(), primaryRelease: vi.fn(), localForget: vi.fn(), ready: vi.fn(), current: true
}));
vi.mock("../../index", () => ({ getBrowserTrustRepository: state.repository }));
vi.mock("../../../provisioning-listener", () => ({ platformReadStoreFor: state.platform }));
vi.mock("../runtime", () => ({ holdCredentialTeardownRuntime: state.hold }));

const binding = { workspaceId: "tenant-one", trustedClientId: "trust-one", approvedByUserId: "disabled-person", clientId: "extension-one", clientType: "extension" as const, domainId: "web" };
const primary = { paths: { fluxiq: "synthetic-platform-root" }, programs: { clientGateway: { ready: state.ready, access: { forgetByCredential: state.localForget } } } } as unknown as FluxIQ;
let runtime: CredentialTeardownRuntime;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  state.current = true;
  runtime = {
    primary, manager: { tenancy: "multi", primaryWorkspaceId: "workspace-main", acquireExisting: state.acquire } as unknown as CredentialTeardownRuntime["manager"],
    current: () => state.current, release: state.primaryRelease
  };
  state.hold.mockResolvedValue(runtime);
  state.repository.mockReturnValue({ lookupCredential: state.proof });
  state.proof.mockResolvedValue({ status: "current", binding });
  state.platform.mockResolvedValue({ getWorkspace: state.store });
  state.store.mockResolvedValue({ workspaceId: "tenant-one" });
  state.acquire.mockImplementation(async (_id, input) => {
    if (!await input.exists()) return null;
    return { release: state.release, fluxiq: { programs: { clientGateway: { revokeTrustedClient: state.revoke } } } };
  });
  state.revoke.mockResolvedValue(true);
  state.localForget.mockResolvedValue(true);
});

describe("credential-only client teardown", () => {
  it.each(["current", "previous", "obsolete"])("allows %s proof to end only its own ordinary trust without account/socket lookup", async status => {
    state.proof.mockResolvedValue({ status, binding, ...(status === "obsolete" ? { reuse: "revoke" } : {}) });
    expect(await forgetClientCredential("synthetic-proof")).toBe(true);
    expect(state.repository).toHaveBeenCalledWith(primary.paths.fluxiq);
    expect(state.platform).toHaveBeenCalledWith(primary);
    expect(state.acquire).toHaveBeenCalledWith("tenant-one", expect.objectContaining({ current: expect.any(Function), exists: expect.any(Function) }));
    expect(state.revoke).toHaveBeenCalledWith("trust-one", expect.any(String), null);
    expect(state.release).toHaveBeenCalledOnce();
    expect(state.primaryRelease).toHaveBeenCalledOnce();
    expect(state.ready).not.toHaveBeenCalled();
  });

  const inactive: ClientTrustCredentialProof[] = [
    { status: "invalid", reason: "unknown" }, { status: "invalid", reason: "forged" },
    { status: "inactive", reason: "expired", binding }
  ];
  it.each(inactive)("processes unusable proof idempotently ($status / $reason)", async proof => {
    state.proof.mockResolvedValue(proof);
    expect(await forgetClientCredential("synthetic-proof")).toBe(false);
    expect(state.acquire).not.toHaveBeenCalled();
    expect(state.platform).not.toHaveBeenCalled();
    expect(state.revoke).not.toHaveBeenCalled();
    expect(state.primaryRelease).toHaveBeenCalledOnce();
  });

  it("retries remaining owner cleanup for a proved revoked binding without requiring an active account", async () => {
    state.proof.mockResolvedValue({ status: "inactive", reason: "revoked", binding });
    state.revoke.mockResolvedValue(false);
    expect(await forgetClientCredential("synthetic-proof")).toBe(false);
    expect(state.acquire).toHaveBeenCalledWith("tenant-one", expect.any(Object));
    expect(state.revoke).toHaveBeenCalledWith("trust-one", expect.any(String), null);
    expect(state.release).toHaveBeenCalledOnce();
    expect(state.primaryRelease).toHaveBeenCalledOnce();
  });

  it("does not pretend remaining cleanup for revoked trust succeeded when its owner fails", async () => {
    state.proof.mockResolvedValue({ status: "inactive", reason: "revoked", binding });
    state.revoke.mockRejectedValue(new Error("private cleanup failure"));
    await expect(forgetClientCredential("synthetic-proof")).rejects.toThrow("Client trust could not be removed");
    expect(state.release).toHaveBeenCalledOnce();
    expect(state.primaryRelease).toHaveBeenCalledOnce();
  });

  it.each([{ managedHost: { id: "managed-one" } }, { workspaceId: "workspace-main" }])("does not revoke a managed or primary binding", async extra => {
    state.proof.mockResolvedValue({ status: "current", binding: { ...binding, ...extra } });
    expect(await forgetClientCredential("synthetic-proof")).toBe(false);
    expect(state.acquire).not.toHaveBeenCalled();
    expect(state.revoke).not.toHaveBeenCalled();
  });

  it("does not acquire a missing catalog workspace", async () => {
    state.store.mockResolvedValue(null);
    expect(await forgetClientCredential("synthetic-proof")).toBe(false);
    expect(state.revoke).not.toHaveBeenCalled();
    expect(state.release).not.toHaveBeenCalled();
  });

  it("does not substitute a mismatched catalog workspace", async () => {
    state.store.mockResolvedValue({ workspaceId: "tenant-other" });
    expect(await forgetClientCredential("synthetic-proof")).toBe(false);
    expect(state.revoke).not.toHaveBeenCalled();
  });

  it("processes an absent physical root without pretending a revocation happened", async () => {
    state.acquire.mockResolvedValue(null);
    expect(await forgetClientCredential("synthetic-proof")).toBe(false);
    expect(state.revoke).not.toHaveBeenCalled();
    expect(state.primaryRelease).toHaveBeenCalledOnce();
  });

  it("retains the actual boolean result for repeated cleanup", async () => {
    state.revoke.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await forgetClientCredential("synthetic-proof")).toBe(true);
    expect(await forgetClientCredential("synthetic-proof")).toBe(false);
    expect(state.release).toHaveBeenCalledTimes(2);
    expect(state.primaryRelease).toHaveBeenCalledTimes(2);
  });

  it("does not release either lease or publish success while a durable revocation waits", async () => {
    const write = deferred<boolean>();
    const entered = deferred<void>();
    state.revoke.mockImplementation(() => {
      entered.resolve();
      return write.promise;
    });
    let settled = false;
    const pending = forgetClientCredential("synthetic-proof").then(result => {
      settled = true;
      return result;
    });
    await entered.promise;
    expect(settled).toBe(false);
    expect(state.release).not.toHaveBeenCalled();
    expect(state.primaryRelease).not.toHaveBeenCalled();
    write.resolve(true);
    expect(await pending).toBe(true);
    expect(state.release).toHaveBeenCalledOnce();
    expect(state.primaryRelease).toHaveBeenCalledOnce();
  });

  it("sanitizes a late persistence failure after waiting and releasing each lease once", async () => {
    const write = deferred<boolean>();
    const entered = deferred<void>();
    state.revoke.mockImplementation(() => {
      entered.resolve();
      return write.promise;
    });
    const pending = forgetClientCredential("synthetic-proof");
    const refused = expect(pending).rejects.toThrow("Client trust could not be removed. Please try again.");
    await entered.promise;
    expect(state.release).not.toHaveBeenCalled();
    write.reject(new Error("private persistence detail"));
    await refused;
    expect(state.release).toHaveBeenCalledOnce();
    expect(state.primaryRelease).toHaveBeenCalledOnce();
  });

  it("releases a lease when the primary changes in the acquisition continuation", async () => {
    state.acquire.mockImplementation(async () => {
      queueMicrotask(() => { state.current = false; });
      return { release: state.release, fluxiq: { programs: { clientGateway: { revokeTrustedClient: state.revoke } } } };
    });
    await expect(forgetClientCredential("synthetic-proof")).rejects.toThrow("Client trust could not be removed");
    expect(state.revoke).not.toHaveBeenCalled();
    expect(state.release).toHaveBeenCalledOnce();
    expect(state.primaryRelease).toHaveBeenCalledOnce();
  });

  it.each(["proof", "platform", "store"] as const)("does not start new work after retirement during the %s await", async phase => {
    state[phase].mockImplementation(async () => {
      state.current = false;
      if (phase === "proof") return { status: "current", binding };
      if (phase === "platform") return { getWorkspace: state.store };
      return { workspaceId: "tenant-one" };
    });
    await expect(forgetClientCredential("synthetic-proof")).rejects.toThrow("Client trust could not be removed");
    expect(state.revoke).not.toHaveBeenCalled();
    expect(state.primaryRelease).toHaveBeenCalledOnce();
  });

  it("rejects malformed revoker results instead of erasing the boolean envelope", async () => {
    state.revoke.mockResolvedValue(undefined);
    await expect(forgetClientCredential("synthetic-proof")).rejects.toThrow("Client trust could not be removed");
    expect(state.release).toHaveBeenCalledOnce();
  });

  it("preserves local credential-only behavior without consulting platform authority", async () => {
    Object.assign(runtime.manager, { tenancy: "single" });
    expect(await forgetClientCredential("synthetic-local-proof")).toBe(true);
    expect(state.ready).toHaveBeenCalledOnce();
    expect(state.localForget).toHaveBeenCalledWith("synthetic-local-proof");
    expect(state.repository).not.toHaveBeenCalled();
    expect(state.platform).not.toHaveBeenCalled();
    expect(state.primaryRelease).toHaveBeenCalledOnce();
  });

  it("retains hosted-only semantics for the existing connect revoke API", async () => {
    Object.assign(runtime.manager, { tenancy: "single" });
    await expect(forgetClientCredential("synthetic-proof", { hostedOnly: true })).rejects.toThrow("Client trust could not be removed");
    expect(state.localForget).not.toHaveBeenCalled();
    expect(state.primaryRelease).toHaveBeenCalledOnce();
  });
});
