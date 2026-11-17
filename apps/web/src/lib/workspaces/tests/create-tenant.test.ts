import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fluxiqLayoutV3Paths, initializeFluxIQLayoutV3, type FluxIQ } from "fluxiq";
import { HeldKeys } from "fluxiq/secret-keys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTenantFluxIQ } from "../create-tenant";

const ready = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../initialize-storage", () => ({ initializeFluxIQWebStorage: ready }));
const roots: string[] = [];
beforeEach(() => { ready.mockReset(); });
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture(existing = true) {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-existing-factory-"));
  roots.push(dataRoot);
  const layout = fluxiqLayoutV3Paths(dataRoot);
  await initializeFluxIQLayoutV3(layout);
  const rootDir = path.join(layout.workspacesDir, "tenant-one");
  if (existing) await mkdir(rootDir);
  const fluxiq = { close: vi.fn(async () => undefined) } as unknown as FluxIQ;
  const instantiate = vi.fn(() => fluxiq);
  const beforeOpen = vi.fn(() => true);
  const input = { dataRoot, workspaceId: "tenant-one", heldKeys: new HeldKeys(), instantiate, beforeOpen, existingOnly: true as const, env: {} };
  return { rootDir, fluxiq, instantiate, beforeOpen, input };
}

describe("existing-only tenant construction", () => {
  it("opens an existing directory with the same custody and initializes only that instance", async () => {
    const f = await fixture();
    expect(await createTenantFluxIQ(f.input)).toBe(f.fluxiq);
    expect(f.instantiate).toHaveBeenCalledWith(expect.objectContaining({ rootDir: f.rootDir, heldKeys: f.input.heldKeys, loadEnv: false }));
    expect(ready).toHaveBeenCalledWith(f.fluxiq);
    expect(f.beforeOpen).toHaveBeenCalledTimes(2);
  });

  it("does not create a missing directory despite an existing host layout", async () => {
    const f = await fixture(false);
    expect(await createTenantFluxIQ(f.input)).toBeNull();
    expect(f.instantiate).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
    await expect(stat(f.rootDir)).rejects.toHaveProperty("code", "ENOENT");
  });

  it("does not initialize a missing host layout", async () => {
    const f = await fixture(false);
    const workspacesDir = path.dirname(f.rootDir);
    await rm(workspacesDir, { recursive: true });
    expect(await createTenantFluxIQ(f.input)).toBeNull();
    expect(f.instantiate).not.toHaveBeenCalled();
    await expect(stat(workspacesDir)).rejects.toHaveProperty("code", "ENOENT");
  });

  it("refuses an invalid existing layout without exposing its parser cause", async () => {
    const f = await fixture();
    await writeFile(path.join(path.dirname(f.rootDir), "layout.json"), "private invalid data");
    await expect(createTenantFluxIQ(f.input)).rejects.toThrow("workspaces.existing_layout_invalid");
    expect(f.instantiate).not.toHaveBeenCalled();
  });

  it.each([false, undefined, Promise.resolve(true)])("requires literal synchronous permission before opening (%s)", async value => {
    const f = await fixture();
    f.beforeOpen.mockReturnValue(value as boolean);
    expect(await createTenantFluxIQ(f.input)).toBeNull();
    expect(f.instantiate).not.toHaveBeenCalled();
  });

  it("rechecks the manager fence after the awaited directory stat", async () => {
    const f = await fixture();
    f.beforeOpen.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(await createTenantFluxIQ(f.input)).toBeNull();
    expect(f.instantiate).not.toHaveBeenCalled();
  });

  it("closes a constructed instance when storage readiness rejects", async () => {
    const f = await fixture();
    ready.mockRejectedValueOnce(new Error("private readiness failure"));
    await expect(createTenantFluxIQ(f.input)).rejects.toThrow("private readiness failure");
    expect(f.fluxiq.close).toHaveBeenCalledWith({ mode: "evict" });
  });

  it("preserves ordinary creation for a missing tenant", async () => {
    const f = await fixture(false);
    expect(await createTenantFluxIQ({ ...f.input, existingOnly: false })).toBe(f.fluxiq);
    expect((await stat(f.rootDir)).isDirectory()).toBe(true);
    expect(f.beforeOpen).not.toHaveBeenCalled();
  });
});
