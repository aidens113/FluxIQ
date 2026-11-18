import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readOwnerFixture, readRuntime, resetReadRuntime } from "./read-runtime";

vi.mock("../../../../server/provisioning-listener", async () => {
  const { readRuntime } = await import("./read-runtime");
  return { platformReadStoreFor: readRuntime.storeFactory, platformIamAuditReaderFor: readRuntime.auditFactory };
});

beforeEach(resetReadRuntime);
afterEach(() => vi.unstubAllEnvs());

describe("account read promise continuation boundaries", () => {
  it.each(["cleanup", "retirement"])("starts no physical identity read when %s begins after an awaited guard", async change => {
    const owner = readOwnerFixture();
    await owner.initialize();
    const guard = owner.guard.bind(owner);
    let cleanup: Promise<void> | undefined;
    vi.spyOn(owner, "guard").mockImplementationOnce(async () => {
      await guard();
      queueMicrotask(() => {
        if (change === "cleanup") cleanup = owner.release();
        else readRuntime.current = false;
      });
    });
    await expect(owner.context.identityAccess.snapshot()).rejects.toMatchObject({ refusal: { status: 503 } });
    expect(readRuntime.primary.programs.identityAccess.snapshot).not.toHaveBeenCalled();
    await (cleanup ?? owner.release());
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });

  it("starts no physical store read if cleanup wins the resolved-store continuation", async () => {
    const owner = readOwnerFixture();
    await owner.initialize();
    const guard = owner.guard.bind(owner);
    const physicalRead = vi.spyOn(readRuntime.store, "getAccount");
    let scheduled = false;
    let cleanup: Promise<void> | undefined;
    vi.spyOn(owner, "guard").mockImplementation(async () => {
      await guard();
      if (readRuntime.storeFactory.mock.calls.length > 0 && !scheduled) {
        scheduled = true;
        queueMicrotask(() => queueMicrotask(() => { cleanup = owner.release(); }));
      }
    });
    await expect(owner.context.store.getAccount("member-a")).rejects.toMatchObject({ refusal: { status: 503 } });
    expect(scheduled).toBe(true);
    expect(physicalRead).not.toHaveBeenCalled();
    await (cleanup ?? owner.release());
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });
});
