import { describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectOwnerMemoryStore } from "../memory-store.ts";
import { migrateAutomationStudioProjectOwners } from "../migration.ts";
import type { AutomationStudioProjectOwnerRecords, AutomationStudioProjectOwnerStore } from "../types.ts";

const NOW = () => 1_000;

async function seeded(records: AutomationStudioProjectOwnerRecords): Promise<AutomationStudioProjectOwnerMemoryStore> {
  const store = new AutomationStudioProjectOwnerMemoryStore();
  await store.change((current) => Object.assign(current, records));
  return store;
}

describe("migrateAutomationStudioProjectOwners", () => {
  it("gives every unowned project the default owner and counts them", async () => {
    const store = new AutomationStudioProjectOwnerMemoryStore();
    const result = await migrateAutomationStudioProjectOwners({ store, projectIds: ["p1", "p2", "p1"], defaultOwner: async () => "owner-1", now: NOW });
    expect(result).toMatchObject({ examined: 2, alreadyOwned: 0, assigned: 2, unassigned: 0, defaultOwner: "owner-1" });
    expect([...result.owners]).toEqual([["p1", "owner-1"], ["p2", "owner-1"]]);
    expect(await store.read()).toEqual({
      p1: { userId: "owner-1", source: "default", recordedAt: 1_000 },
      p2: { userId: "owner-1", source: "default", recordedAt: 1_000 }
    });
  });

  it("is idempotent: a second pass assigns nothing and never asks for a default owner", async () => {
    const store = new AutomationStudioProjectOwnerMemoryStore();
    await migrateAutomationStudioProjectOwners({ store, projectIds: ["p1", "p2"], defaultOwner: async () => "owner-1", now: NOW });
    const defaultOwner = vi.fn(async () => "someone-else");
    const second = await migrateAutomationStudioProjectOwners({ store, projectIds: ["p1", "p2"], defaultOwner, now: () => 2_000 });
    expect(second).toMatchObject({ examined: 2, alreadyOwned: 2, assigned: 0, unassigned: 0 });
    expect(defaultOwner).not.toHaveBeenCalled();
    expect((await store.read()).p1).toEqual({ userId: "owner-1", source: "default", recordedAt: 1_000 });
  });

  it("never overwrites a recorded owner, creator or default", async () => {
    const store = await seeded({
      created: { userId: "creator", source: "creator", recordedAt: 5 },
      defaulted: { userId: "earlier-admin", source: "default", recordedAt: 6 }
    });
    const result = await migrateAutomationStudioProjectOwners({ store, projectIds: ["created", "defaulted", "fresh"], defaultOwner: async () => "admin-now", now: NOW });
    expect(result).toMatchObject({ examined: 3, alreadyOwned: 2, assigned: 1, unassigned: 0 });
    expect(Object.fromEntries(result.owners)).toEqual({ created: "creator", defaulted: "earlier-admin", fresh: "admin-now" });
    const records = await store.read();
    expect(records.created).toEqual({ userId: "creator", source: "creator", recordedAt: 5 });
    expect(records.defaulted).toEqual({ userId: "earlier-admin", source: "default", recordedAt: 6 });
  });

  it("keeps a creator recorded between its first read and its write", async () => {
    const inner = await seeded({ racing: { userId: "creator", source: "creator", recordedAt: 9 } });
    // The first read saw nothing; by the time the change runs the creator is recorded.
    const store: AutomationStudioProjectOwnerStore = { read: async () => ({}), change: (mutate) => inner.change(mutate) };
    const result = await migrateAutomationStudioProjectOwners({ store, projectIds: ["racing"], defaultOwner: async () => "admin", now: NOW });
    expect(result).toMatchObject({ assigned: 0, alreadyOwned: 1 });
    expect(result.owners.get("racing")).toBe("creator");
    expect((await inner.read()).racing?.source).toBe("creator");
  });

  it("writes nothing and counts the unowned as unassigned when there is no default owner", async () => {
    const store = await seeded({ owned: { userId: "u", source: "creator", recordedAt: 1 } });
    const change = vi.spyOn(store, "change");
    const result = await migrateAutomationStudioProjectOwners({ store, projectIds: ["owned", "orphan"], defaultOwner: async () => null, now: NOW });
    expect(result).toMatchObject({ examined: 2, alreadyOwned: 1, assigned: 0, unassigned: 1, defaultOwner: null });
    expect(result.owners.get("orphan")).toBeNull();
    expect(change).not.toHaveBeenCalled();
  });

  it("skips ids that cannot name a project", async () => {
    const store = new AutomationStudioProjectOwnerMemoryStore();
    const result = await migrateAutomationStudioProjectOwners({ store, projectIds: ["", "__proto__", "ok"], defaultOwner: async () => "admin", now: NOW });
    expect(result).toMatchObject({ examined: 1, assigned: 1 });
    expect(Object.keys(await store.read())).toEqual(["ok"]);
  });
});
