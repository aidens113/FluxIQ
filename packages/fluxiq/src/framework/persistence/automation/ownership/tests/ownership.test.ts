import { describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectOwnerMemoryStore } from "../memory-store.ts";
import { AutomationStudioProjectOwnership } from "../ownership.ts";
import type { AutomationStudioProjectOwnerCandidate } from "../types.ts";

const ADMIN: AutomationStudioProjectOwnerCandidate = { id: "admin-1", roleId: "admin", enabled: true, createdAtMs: 1 };

function ownershipOf(projects: readonly string[], users: AutomationStudioProjectOwnerCandidate[] = [ADMIN]) {
  const store = new AutomationStudioProjectOwnerMemoryStore();
  const known = new Set(projects);
  const catalog = { hasProject: vi.fn(async (projectId: string) => known.has(projectId)) };
  const listUsers = vi.fn(async () => users);
  const ownership = new AutomationStudioProjectOwnership({ store, catalog, defaults: { users: listUsers }, now: () => 42 });
  return { ownership, store, catalog, listUsers };
}

describe("AutomationStudioProjectOwnership as the project owner resolver", () => {
  it("answers a recorded owner", async () => {
    const { ownership, listUsers } = ownershipOf(["p1"]);
    await ownership.recordOwner("p1", "creator-1");
    expect(await ownership.ownerOf("p1")).toBe("creator-1");
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("gives a project with no recorded owner the default owner on first lookup, and keeps it", async () => {
    const { ownership, store, listUsers } = ownershipOf(["p1"]);
    expect(await ownership.ownerOf("p1")).toBe("admin-1");
    expect((await store.read()).p1).toEqual({ userId: "admin-1", source: "default", recordedAt: 42 });
    expect(await ownership.ownerOf("p1")).toBe("admin-1");
    expect(listUsers).toHaveBeenCalledTimes(1);
  });

  it("answers null for an id that is not a project, and records nothing", async () => {
    const { ownership, store, listUsers } = ownershipOf(["p1"]);
    expect(await ownership.ownerOf("not-a-project")).toBeNull();
    expect(await store.read()).toEqual({});
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("answers null for a deleted project even though its owner was recorded", async () => {
    const known = new Set(["p1"]);
    const store = new AutomationStudioProjectOwnerMemoryStore();
    const ownership = new AutomationStudioProjectOwnership({ store, catalog: { hasProject: async (id) => known.has(id) }, defaults: { users: async () => [ADMIN] } });
    await ownership.recordOwner("p1", "creator-1");
    known.delete("p1");
    expect(await ownership.ownerOf("p1")).toBeNull();
  });

  it("answers null for ids that cannot name a project without asking the catalog", async () => {
    const { ownership, catalog } = ownershipOf(["__proto__", "constructor"]);
    expect(await ownership.ownerOf("")).toBeNull();
    expect(await ownership.ownerOf("__proto__")).toBeNull();
    expect(await ownership.ownerOf(7 as unknown as string)).toBeNull();
    expect(catalog.hasProject).not.toHaveBeenCalled();
    // An inherited property name is an ordinary id: it is a project here, so it is defaulted, not read off the prototype.
    expect(await ownership.ownerOf("constructor")).toBe("admin-1");
  });

  it("leaves a project ownerless while there is nobody to own it, and defaults it once there is", async () => {
    const users: AutomationStudioProjectOwnerCandidate[] = [];
    const { ownership, store } = ownershipOf(["p1"], users);
    expect(await ownership.ownerOf("p1")).toBeNull();
    expect(await store.read()).toEqual({});
    users.push(ADMIN);
    expect(await ownership.ownerOf("p1")).toBe("admin-1");
  });
});

describe("AutomationStudioProjectOwnership.recordOwner", () => {
  it("replaces a default owner with the creator", async () => {
    const { ownership, store } = ownershipOf(["p1"]);
    expect(await ownership.ownerOf("p1")).toBe("admin-1");
    await ownership.recordOwner("p1", "creator-1");
    expect((await store.read()).p1).toEqual({ userId: "creator-1", source: "creator", recordedAt: 42 });
    expect(await ownership.ownerOf("p1")).toBe("creator-1");
  });

  it("is a no-op for the same creator and refuses a different one", async () => {
    const { ownership } = ownershipOf(["p1"]);
    await ownership.recordOwner("p1", "creator-1");
    await ownership.recordOwner("p1", "creator-1");
    await expect(ownership.recordOwner("p1", "intruder")).rejects.toThrow("already has a recorded creator");
    expect(await ownership.ownerOf("p1")).toBe("creator-1");
  });

  it("refuses an unknown project, an unusable id and an empty user id", async () => {
    const { ownership, store } = ownershipOf(["p1"]);
    await expect(ownership.recordOwner("ghost", "u")).rejects.toThrow("unknown Automation Studio project ghost");
    await expect(ownership.recordOwner("__proto__", "u")).rejects.toThrow("usable project id");
    await expect(ownership.recordOwner("p1", "")).rejects.toThrow("needs a user id");
    expect(await store.read()).toEqual({});
  });
});

describe("AutomationStudioProjectOwnership.withProjectOwners", () => {
  it("adds ownerUserId to each project in order, keeping every other field, in one change", async () => {
    const { ownership, store } = ownershipOf(["a", "b", "c"]);
    await ownership.recordOwner("b", "creator-b");
    const change = vi.spyOn(store, "change");
    const projects = [
      { id: "a", name: "A", description: "", createdAt: 1, updatedAt: 1 },
      { id: "b", name: "B", description: "", createdAt: 2, updatedAt: 2 },
      { id: "c", name: "C", description: "", domainId: "web", createdAt: 3, updatedAt: 3 }
    ];
    const owned = await ownership.withProjectOwners(projects);
    expect(owned).toEqual([
      { ...projects[0], ownerUserId: "admin-1" },
      { ...projects[1], ownerUserId: "creator-b" },
      { ...projects[2], ownerUserId: "admin-1" }
    ]);
    expect(change).toHaveBeenCalledTimes(1);
    expect(await ownership.withProjectOwners([])).toEqual([]);
  });
});
