import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readOwnerFixture, readRuntime, resetReadRuntime } from "./read-runtime";

const importGate = vi.hoisted(() => {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  return { entered, waiting, enter, release };
});

vi.mock("../../../../server/provisioning-listener", async () => {
  const { readRuntime } = await import("./read-runtime");
  importGate.enter();
  await importGate.waiting;
  return { platformReadStoreFor: readRuntime.storeFactory, platformIamAuditReaderFor: readRuntime.auditFactory };
});

beforeEach(resetReadRuntime);
afterEach(() => vi.unstubAllEnvs());

describe("pinned account read module handoff", () => {
  it("checks the current primary after a deferred import and refuses before invoking any factory", async () => {
    const owner = readOwnerFixture();
    await owner.initialize();
    const read = owner.context.store.getAccount("member-a").catch((error: unknown) => error);
    await importGate.entered;
    readRuntime.current = false;
    expect(readRuntime.base.releases.a).not.toHaveBeenCalled();
    expect(readRuntime.base.releases.primary).not.toHaveBeenCalled();
    importGate.release();
    expect(await read).toMatchObject({ refusal: { status: 503 } });
    await owner.release();
    expect(readRuntime.storeFactory).not.toHaveBeenCalled();
    expect(readRuntime.afterReload).not.toHaveBeenCalled();
    expect(readRuntime.base.releases.a).toHaveBeenCalledOnce();
    expect(readRuntime.base.releases.primary).toHaveBeenCalledOnce();
  });
});
