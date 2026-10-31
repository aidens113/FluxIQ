import type { FluxIQ } from "fluxiq";
import { HeldKeys } from "fluxiq/secret-keys";
import { describe, expect, it, vi } from "vitest";
import { FluxIQWorkspaceManager } from "../workspace-manager";
import type { WorkspaceManagerOptions } from "../WorkspaceManagerOptions";

// The manager's bookkeeping, over stand-in instances: what it creates, keeps,
// evicts and closes, and when. The real-instance proof (eviction frees the
// instance, an unlock survives it) is in `tenant-eviction.test.ts`.

type FakeInstance = FluxIQ & { label: string; closes: string[] };

function fakeInstance(label: string, closeGate?: Promise<void>): FakeInstance {
  const closes: string[] = [];
  return {
    label,
    closes,
    paths: { root: `/data/${label}` },
    programs: { clientGateway: { label } },
    close: vi.fn(async (options?: { mode?: string }) => {
      closes.push(options?.mode ?? "shutdown");
      await closeGate;
    })
  } as unknown as FakeInstance;
}

function harness(overrides: Partial<WorkspaceManagerOptions> = {}) {
  let clock = 1_000;
  const busy = new Set<string>();
  const created: FakeInstance[] = [];
  const warnings: string[] = [];
  const primary = fakeInstance("primary");
  const createTenant = vi.fn(async ({ workspaceId }: { workspaceId: string; heldKeys: HeldKeys }) => {
    const instance = fakeInstance(workspaceId);
    created.push(instance);
    return instance;
  });
  const manager = new FluxIQWorkspaceManager({
    tenancy: "multi",
    primaryWorkspaceId: "workspace-main",
    createPrimary: () => primary,
    createTenant,
    isBusy: (fluxiq) => busy.has((fluxiq as FakeInstance).label),
    idleMs: 60_000,
    cacheMax: 100,
    sweepIntervalMs: 0,
    now: () => clock,
    warn: (message) => warnings.push(message),
    ...overrides
  });
  return { manager, primary, created, createTenant, busy, warnings, advance: (ms: number) => { clock += ms; } };
}

describe("FluxIQWorkspaceManager", () => {
  it("creates one instance per workspace however many callers ask at once", async () => {
    const { manager, createTenant } = harness();
    const leases = await Promise.all([manager.acquire("ws-a"), manager.acquire("ws-a"), manager.acquire("ws-a")]);
    expect(createTenant).toHaveBeenCalledTimes(1);
    expect(new Set(leases.map((lease) => lease.fluxiq)).size).toBe(1);
    expect(manager.get("ws-a")?.leases).toBe(3);
    for (const lease of leases) lease.release();
    leases[0]!.release();
    expect(manager.get("ws-a")?.leases).toBe(0);
  });

  it("does not keep a failed create, and the next acquire tries again", async () => {
    const failing = vi.fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockImplementation(async ({ workspaceId }: { workspaceId: string }) => fakeInstance(workspaceId));
    const { manager, warnings } = harness({ createTenant: failing });
    await expect(manager.acquire("ws-a")).rejects.toThrow("disk full");
    expect(manager.get("ws-a")).toBeUndefined();
    expect(warnings.some((line) => line.includes("could not be opened"))).toBe(true);
    const lease = await manager.acquire("ws-a");
    expect(failing).toHaveBeenCalledTimes(2);
    lease.release();
  });

  it("evicts an idle workspace after the idle time and keeps a busy one past it", async () => {
    const { manager, busy, advance, created } = harness();
    (await manager.acquire("ws-idle")).release();
    const held = await manager.acquire("ws-held");
    (await manager.acquire("ws-running")).release();
    busy.add("ws-running");
    advance(60_000);
    await manager.sweep();
    expect(manager.workspaceIds()).toEqual(["workspace-main", "ws-held", "ws-running"]);
    expect(created.find((instance) => instance.label === "ws-idle")?.closes).toEqual(["evict"]);
    // A run that ended counts as use: the workspace is idle from then, not from its last lease.
    busy.delete("ws-running");
    await manager.sweep();
    expect(manager.get("ws-running")).toBeDefined();
    advance(60_000);
    await manager.sweep();
    expect(manager.get("ws-running")).toBeUndefined();
    expect(manager.get("ws-held")).toBeDefined();
    held.release();
  });

  it("evicts the least recently used beyond the cap, never a busy one, and warns once when busy ones exceed it", async () => {
    const { manager, advance, warnings } = harness({ cacheMax: 3 });
    expect(manager.primary().fluxiq).toBeDefined();
    (await manager.acquire("ws-1")).release();
    advance(10);
    const held = await manager.acquire("ws-2");
    advance(10);
    (await manager.acquire("ws-3")).release();
    // The primary, ws-2 (held) and ws-3 fit; ws-1 was the least recently used.
    await vi.waitFor(() => expect(manager.workspaceIds()).toEqual(["workspace-main", "ws-2", "ws-3"]));
    const more = await manager.acquire("ws-4");
    const evenMore = await manager.acquire("ws-5");
    await manager.sweep();
    expect(manager.workspaceIds()).toEqual(["workspace-main", "ws-2", "ws-4", "ws-5"]);
    expect(warnings.filter((line) => line.includes("More workspaces are busy"))).toHaveLength(1);
    for (const lease of [held, more, evenMore]) lease.release();
    await manager.sweep();
    expect(manager.workspaceIds()).toHaveLength(3);
  });

  it("never evicts the primary", async () => {
    const { manager, advance, primary } = harness({ cacheMax: 1 });
    (await manager.acquire("workspace-main")).release();
    advance(10 * 60_000);
    await manager.sweep();
    expect(manager.get("workspace-main")?.fluxiq).toBe(primary);
    expect(primary.closes).toEqual([]);
  });

  it("waits for an eviction's close before creating the workspace again on the same root", async () => {
    let finishClose!: () => void;
    const gate = new Promise<void>((resolve) => { finishClose = resolve; });
    const instances: FakeInstance[] = [];
    const { manager, advance } = harness({
      createTenant: async ({ workspaceId }) => {
        const instance = fakeInstance(workspaceId, instances.length === 0 ? gate : undefined);
        instances.push(instance);
        return instance;
      }
    });
    (await manager.acquire("ws-a")).release();
    advance(60_000);
    const sweeping = manager.sweep();
    let reopened = false;
    const again = manager.acquire("ws-a").then((lease) => {
      reopened = true;
      return lease;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reopened).toBe(false);
    expect(instances).toHaveLength(1);
    finishClose();
    const lease = await again;
    await sweeping;
    expect(instances).toHaveLength(2);
    expect(lease.fluxiq).toBe(instances[1]);
    lease.release();
  });

  it("keeps a tenant's custody across eviction and hands the same HeldKeys to the next instance", async () => {
    const custody: HeldKeys[] = [];
    const { manager, advance } = harness({
      createTenant: async ({ workspaceId, heldKeys }) => {
        custody.push(heldKeys);
        return fakeInstance(workspaceId);
      }
    });
    (await manager.acquire("ws-a")).release();
    advance(60_000);
    await manager.sweep();
    (await manager.acquire("ws-a")).release();
    expect(custody).toHaveLength(2);
    expect(custody[1]).toBe(custody[0]);
    expect(manager.get("ws-a")?.heldKeys).toBe(custody[0]);
  });

  it("deletes a workspace: refused while in use, then closes it for good, revokes its keys and removes its root", async () => {
    const removeTenantRoot = vi.fn(async () => undefined);
    const custody: HeldKeys[] = [];
    const { manager, created } = harness({
      removeTenantRoot,
      createTenant: async ({ workspaceId, heldKeys }) => {
        custody.push(heldKeys);
        const instance = fakeInstance(workspaceId);
        created.push(instance);
        return instance;
      }
    });
    const lease = await manager.acquire("ws-a");
    const revokeAll = vi.spyOn(custody[0]!, "revokeAll");
    await expect(manager.deleteWorkspace("ws-a")).rejects.toThrow("workspaces.busy");
    expect(revokeAll).not.toHaveBeenCalled();
    lease.release();
    const deleting = manager.deleteWorkspace("ws-a");
    await expect(manager.acquire("ws-a")).rejects.toThrow("workspaces.deleting");
    await deleting;
    expect(created[0]!.closes).toEqual(["shutdown"]);
    expect(revokeAll).toHaveBeenCalledTimes(1);
    expect(removeTenantRoot).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws-a" }));
    // A new workspace of the same id starts with custody of its own.
    (await manager.acquire("ws-a")).release();
    expect(custody[1]).not.toBe(custody[0]);
    await expect(manager.deleteWorkspace("workspace-main")).rejects.toThrow("workspaces.primary_undeletable");
  });

  it("deletes an evicted workspace's keys too", async () => {
    const custody: HeldKeys[] = [];
    const { manager, advance } = harness({
      createTenant: async ({ workspaceId, heldKeys }) => {
        custody.push(heldKeys);
        return fakeInstance(workspaceId);
      }
    });
    (await manager.acquire("ws-a")).release();
    advance(60_000);
    await manager.sweep();
    const revokeAll = vi.spyOn(custody[0]!, "revokeAll");
    await manager.deleteWorkspace("ws-a");
    expect(revokeAll).toHaveBeenCalledTimes(1);
  });

  it("closes every workspace on shutdown, the primary last, revokes every custody and refuses later acquires", async () => {
    const custody: HeldKeys[] = [];
    const order: string[] = [];
    const { manager, primary } = harness({
      createTenant: async ({ workspaceId, heldKeys }) => {
        custody.push(heldKeys);
        const instance = fakeInstance(workspaceId);
        (instance.close as ReturnType<typeof vi.fn>).mockImplementation(async (options?: { mode?: string }) => { order.push(`${workspaceId}:${options?.mode}`); });
        return instance;
      }
    });
    (primary.close as ReturnType<typeof vi.fn>).mockImplementation(async () => { order.push("primary"); });
    manager.primary();
    (await manager.acquire("ws-a")).release();
    (await manager.acquire("ws-b")).release();
    const revokes = custody.map((heldKeys) => vi.spyOn(heldKeys, "revokeAll"));
    await Promise.all([manager.close(), manager.close()]);
    expect(order).toEqual(["ws-a:shutdown", "ws-b:shutdown", "primary"]);
    for (const revoke of revokes) expect(revoke).toHaveBeenCalledTimes(1);
    await expect(manager.acquire("ws-a")).rejects.toThrow("workspaces.closed");
  });

  it("under single tenancy holds the primary alone and refuses any other workspace", async () => {
    const primary = fakeInstance("primary");
    const createPrimary = vi.fn(() => primary);
    const manager = new FluxIQWorkspaceManager({ tenancy: "single", primaryWorkspaceId: "workspace-main", createPrimary });
    const lease = await manager.acquire("workspace-main");
    expect(lease.fluxiq).toBe(primary);
    expect(manager.primary().fluxiq).toBe(primary);
    expect(manager.primary().heldKeys).toBeNull();
    expect(manager.workspaceIds()).toEqual(["workspace-main"]);
    await expect(manager.acquire("ws-other")).rejects.toThrow("workspaces.unknown_workspace");
    expect(createPrimary).toHaveBeenCalledTimes(1);
    lease.release();
    await manager.close();
    expect(primary.closes).toEqual(["shutdown"]);
  });

  it("treats an instance whose activity cannot be read as busy", async () => {
    const { manager, advance, warnings } = harness({ isBusy: () => { throw new Error("unreadable"); } });
    (await manager.acquire("ws-a")).release();
    advance(60_000);
    await manager.sweep();
    expect(manager.get("ws-a")).toBeDefined();
    expect(warnings.some((line) => line.includes("kept open"))).toBe(true);
  });

  it("refuses a lease whose construction finishes after shutdown starts", async () => {
    let finishOpen!: (instance: FluxIQ) => void;
    const gate = new Promise<FluxIQ>((resolve) => { finishOpen = resolve; });
    const { manager } = harness({ createTenant: () => gate });
    const pending = manager.acquire("ws-a");
    const refused = expect(pending).rejects.toThrow("workspaces.closed");
    const closing = manager.close();
    const instance = fakeInstance("ws-a");
    finishOpen(instance);
    await Promise.all([refused, closing]);
    expect(instance.closes).toEqual(["shutdown"]);
    expect(manager.get("ws-a")).toBeUndefined();
  });

  it.each(["shutdown", "delete"])("does not reopen after an eviction wait if %s started", async (action) => {
    let finishClose!: () => void;
    const gate = new Promise<void>((resolve) => { finishClose = resolve; });
    const removeTenantRoot = vi.fn(async () => undefined);
    const createTenant = vi.fn(async ({ workspaceId }: { workspaceId: string }) => fakeInstance(workspaceId, gate));
    const { manager, advance } = harness({ createTenant, removeTenantRoot });
    (await manager.acquire("ws-a")).release();
    advance(60_000);
    const sweeping = manager.sweep();
    const reopening = manager.acquire("ws-a");
    const refused = expect(reopening).rejects.toThrow(action === "shutdown" ? "workspaces.closed" : "workspaces.deleting");
    const stopping = action === "shutdown" ? manager.close() : manager.deleteWorkspace("ws-a");
    finishClose();
    await Promise.all([sweeping, refused, stopping]);
    expect(createTenant).toHaveBeenCalledTimes(1);
    expect(manager.get("ws-a")).toBeUndefined();
    if (action === "delete") expect(removeTenantRoot).toHaveBeenCalledTimes(1);
    await manager.close();
  });

  it("does not lease an instance whose construction is being deleted", async () => {
    let finishOpen!: (instance: FluxIQ) => void;
    const gate = new Promise<FluxIQ>((resolve) => { finishOpen = resolve; });
    const removeTenantRoot = vi.fn(async () => undefined);
    const { manager } = harness({ createTenant: () => gate, removeTenantRoot });
    const pending = manager.acquire("ws-a");
    const refused = expect(pending).rejects.toThrow("workspaces.deleting");
    const deleting = manager.deleteWorkspace("ws-a");
    const instance = fakeInstance("ws-a");
    finishOpen(instance);
    await Promise.all([refused, deleting]);
    expect(instance.closes).toEqual(["shutdown"]);
    expect(removeTenantRoot).toHaveBeenCalledTimes(1);
    await manager.close();
  });

  it.each(["evict", "delete"])("keeps a failed %s close as a barrier to reopening its root", async (action) => {
    const instance = fakeInstance("ws-a");
    vi.mocked(instance.close).mockRejectedValue(new Error("connection still open"));
    const createTenant = vi.fn(async () => instance);
    const removeTenantRoot = vi.fn(async () => undefined);
    const { manager, advance } = harness({ createTenant, removeTenantRoot });
    (await manager.acquire("ws-a")).release();
    advance(60_000);
    await expect(action === "evict" ? manager.sweep() : manager.deleteWorkspace("ws-a")).rejects.toThrow("connection still open");
    await expect(manager.acquire("ws-a")).rejects.toThrow("connection still open");
    expect(createTenant).toHaveBeenCalledTimes(1);
    expect(removeTenantRoot).not.toHaveBeenCalled();
    await expect(manager.close()).rejects.toThrow("connection still open");
  });

  it("never creates or replaces a primary after close", async () => {
    const createPrimary = vi.fn(() => fakeInstance("primary"));
    const { manager } = harness({ createPrimary });
    await manager.close();
    expect(() => manager.primary()).toThrow("workspaces.closed");
    expect(() => manager.replacePrimary(fakeInstance("replacement"))).toThrow("workspaces.closed");
    expect(createPrimary).not.toHaveBeenCalled();
  });
});
