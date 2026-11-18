import { mkdtemp, mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FluxIQ } from "fluxiq";
import type { HeldKeys } from "fluxiq/secret-keys";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FluxIQWorkspaceManager } from "../workspace-manager";
import type { WorkspaceManagerOptions } from "../WorkspaceManagerOptions";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function instance(): FluxIQ {
  return { close: vi.fn(async () => undefined), programs: {} } as unknown as FluxIQ;
}

const managers: FluxIQWorkspaceManager[] = [];
const roots: string[] = [];
function harness(overrides: Partial<WorkspaceManagerOptions> = {}, includeExistingFactory = true) {
  const primary = instance();
  const tenant = instance();
  const createTenant = vi.fn(async (_input: { workspaceId: string; heldKeys: HeldKeys; primary: FluxIQ }) => instance());
  const openExistingTenant = vi.fn(async () => tenant);
  const manager = new FluxIQWorkspaceManager({
    tenancy: "multi", primaryWorkspaceId: "workspace-main", createPrimary: () => primary,
    createTenant, ...(includeExistingFactory ? { openExistingTenant } : {}), isBusy: () => false, sweepIntervalMs: 0, warn: vi.fn(), ...overrides
  });
  managers.push(manager);
  const input = { exists: vi.fn(async () => true), current: vi.fn(() => true) };
  return { manager, primary, tenant, createTenant, openExistingTenant, input };
}

afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("existing-only workspace acquisition", () => {
  it("opens a cold existing tenant with a real lease and never calls the creating factory", async () => {
    const f = harness();
    const lease = await f.manager.acquireExisting("tenant-one", f.input);
    expect(lease?.fluxiq).toBe(f.tenant);
    expect(f.createTenant).not.toHaveBeenCalled();
    expect(f.openExistingTenant).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "tenant-one", primary: f.primary, beforeOpen: expect.any(Function) }));
    expect(f.manager.get("tenant-one")?.leases).toBe(1);
    lease!.release();
    lease!.release();
    expect(f.manager.get("tenant-one")?.leases).toBe(0);
    expect(f.input.exists).toHaveBeenCalledTimes(2);
  });

  it("reuses the exact warm owner without invoking either tenant factory", async () => {
    const f = harness();
    const held = await f.manager.acquire("tenant-one");
    const lease = await f.manager.acquireExisting("tenant-one", f.input);
    expect(lease?.fluxiq).toBe(held.fluxiq);
    expect(f.createTenant).toHaveBeenCalledOnce();
    expect(f.openExistingTenant).not.toHaveBeenCalled();
    held.release();
    lease!.release();
  });

  it.each([false, undefined, null])("does not open a tenant when catalog existence is not true (%s)", async value => {
    const f = harness();
    f.input.exists.mockResolvedValue(value as boolean);
    expect(await f.manager.acquireExisting("tenant-one", f.input)).toBeNull();
    expect(f.openExistingTenant).not.toHaveBeenCalled();
    expect(f.createTenant).not.toHaveBeenCalled();
  });

  it("fails closed when an existing-only factory is unavailable", async () => {
    const f = harness({}, false);
    await expect(f.manager.acquireExisting("tenant-one", f.input)).rejects.toThrow("existing_factory_missing");
    expect(f.createTenant).not.toHaveBeenCalled();
  });

  it("releases an unpublished lease when the catalog disappears after opening", async () => {
    const f = harness();
    f.input.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await f.manager.acquireExisting("tenant-one", f.input)).toBeNull();
    expect(f.manager.get("tenant-one")?.leases).toBe(0);
  });

  it("does not expose a nullable opening to ordinary acquire or retain empty failed custody", async () => {
    const gate = deferred<FluxIQ | null>();
    const entered = deferred<void>();
    let absentCustody: HeldKeys | undefined;
    const f = harness({ openExistingTenant: async input => {
      absentCustody = input.heldKeys;
      entered.resolve();
      return gate.promise;
    } });
    const absent = f.manager.acquireExisting("tenant-one", f.input);
    await entered.promise;
    const ordinary = f.manager.acquire("tenant-one");
    expect(f.createTenant).not.toHaveBeenCalled();
    gate.resolve(null);
    expect(await absent).toBeNull();
    const lease = await ordinary;
    expect(lease.fluxiq).toBeDefined();
    expect(f.createTenant).toHaveBeenCalledOnce();
    expect(f.createTenant.mock.calls[0]?.[0].heldKeys).not.toBe(absentCustody);
    lease.release();
  });

  it("removes empty custody after a failed existing open and reports only a fixed log code", async () => {
    const custody: HeldKeys[] = [];
    const warn = vi.fn();
    const f = harness({ warn, openExistingTenant: async input => {
      custody.push(input.heldKeys);
      if (custody.length === 1) throw new Error("private host failure");
      return instance();
    } });
    await expect(f.manager.acquireExisting("tenant-one", f.input)).rejects.toThrow("private host failure");
    const lease = await f.manager.acquireExisting("tenant-one", f.input);
    expect(custody[1]).not.toBe(custody[0]);
    expect(warn).toHaveBeenCalledWith(expect.any(String), { code: "workspaces.existing_open_failed" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private host failure");
    lease!.release();
  });

  it("checks synchronous runtime currentness in the continuation after catalog lookup", async () => {
    let current = true;
    const f = harness();
    f.input.current.mockImplementation(() => current);
    f.input.exists.mockImplementation(async () => {
      queueMicrotask(() => { current = false; });
      return true;
    });
    await expect(f.manager.acquireExisting("tenant-one", f.input)).rejects.toThrow("existing_changed");
    expect(f.openExistingTenant).not.toHaveBeenCalled();
  });

  it("releases a held lease after a failed final catalog read", async () => {
    const f = harness();
    f.input.exists.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("catalog failed"));
    await expect(f.manager.acquireExisting("tenant-one", f.input)).rejects.toThrow("catalog failed");
    expect(f.manager.get("tenant-one")?.leases).toBe(0);
  });

  it("does not miss deletion that finishes during the preliminary catalog lookup", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-teardown-delete-"));
    roots.push(root);
    const tenantRoot = path.join(root, "tenant-one");
    await mkdir(tenantRoot);
    const lookup = deferred<boolean>();
    const f = harness({ removeTenantRoot: async () => { await rm(tenantRoot, { recursive: true }); } });
    f.input.exists.mockImplementation(() => lookup.promise);
    const pending = f.manager.acquireExisting("tenant-one", f.input);
    const refused = expect(pending).rejects.toThrow("existing_changed");
    await f.manager.deleteWorkspace("tenant-one");
    lookup.resolve(true);
    await refused;
    expect(f.openExistingTenant).not.toHaveBeenCalled();
    await expect(stat(tenantRoot)).rejects.toHaveProperty("code", "ENOENT");
  });

  it("installs the opening reservation before reentrant factory deletion", async () => {
    let deleting: Promise<void> | undefined;
    const removeTenantRoot = vi.fn(async () => undefined);
    const f = harness({ removeTenantRoot, openExistingTenant: async input => {
      deleting = f.manager.deleteWorkspace(input.workspaceId);
      expect(removeTenantRoot).not.toHaveBeenCalled();
      expect(input.beforeOpen()).toBe(false);
      return null;
    } });
    await expect(f.manager.acquireExisting("tenant-one", f.input)).rejects.toThrow(/deleting|existing_changed/u);
    await deleting;
    expect(removeTenantRoot).toHaveBeenCalledOnce();
    expect(f.createTenant).not.toHaveBeenCalled();
  });

  it("deletion waits for constructing an existing root, then closes it before removing it", async () => {
    const gate = deferred<FluxIQ | null>();
    const entered = deferred<void>();
    const removeTenantRoot = vi.fn(async () => undefined);
    const f = harness({ removeTenantRoot, openExistingTenant: () => {
      entered.resolve();
      return gate.promise;
    } });
    const pending = f.manager.acquireExisting("tenant-one", f.input);
    await entered.promise;
    const refused = expect(pending).rejects.toThrow(/deleting|existing_changed/u);
    const deleting = f.manager.deleteWorkspace("tenant-one");
    expect(removeTenantRoot).not.toHaveBeenCalled();
    gate.resolve(f.tenant);
    await Promise.all([refused, deleting]);
    expect(f.tenant.close).toHaveBeenCalledWith({ mode: "shutdown" });
    expect(removeTenantRoot).toHaveBeenCalledOnce();
    expect(f.manager.get("tenant-one")).toBeUndefined();
  });

  it("holds deletion out while the final existence read settles and releases on refusal", async () => {
    const lookup = deferred<boolean>();
    const entered = deferred<void>();
    const f = harness();
    f.input.exists.mockResolvedValueOnce(true).mockImplementationOnce(() => {
      entered.resolve();
      return lookup.promise;
    });
    const pending = f.manager.acquireExisting("tenant-one", f.input);
    await entered.promise;
    await expect(f.manager.deleteWorkspace("tenant-one")).rejects.toThrow("workspaces.busy");
    const refused = expect(pending).rejects.toThrow("existing_changed");
    lookup.resolve(true);
    await refused;
    expect(f.manager.get("tenant-one")?.leases).toBe(0);
  });

  it("does not start an existing factory after shutdown during lookup", async () => {
    const lookup = deferred<boolean>();
    const f = harness();
    f.input.exists.mockImplementation(() => lookup.promise);
    const pending = f.manager.acquireExisting("tenant-one", f.input);
    const refused = expect(pending).rejects.toThrow("workspaces.closed");
    await f.manager.close();
    lookup.resolve(true);
    await refused;
    expect(f.openExistingTenant).not.toHaveBeenCalled();
  });
});
