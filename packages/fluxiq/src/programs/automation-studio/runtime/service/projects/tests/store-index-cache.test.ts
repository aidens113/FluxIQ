// The project index is read again only when its file changes. Nearly every
// service operation reads the index to check its project; a file whose
// identity (id, size, modification time) is unchanged is served from the copy
// last read, and any write -- this store's or another's -- is seen at once.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramJsonStore } from "../../../../../_shared/storage.ts";
import { AutomationStudioProjectPaths } from "../../paths/index.ts";
import { AutomationStudioProjectStore } from "../store.ts";
import type { AutomationStudioProjectIndex } from "../types.ts";

let rootDir = "";

function project(id: string) {
  return { id, name: id, createdAt: 1, updatedAt: 1 } as never;
}

describe("the project index cache", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-index-cache-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("reads an unchanged index file once, and hands out copies a caller cannot corrupt", async () => {
    const store = new AutomationStudioProjectStore(new AutomationStudioProjectPaths(rootDir));
    await store.writeProjectIndex(() => ({ categories: [], projects: [project("project.one")] }));
    const read = vi.spyOn(ProgramJsonStore.prototype, "read");
    const first = await store.readProjectIndex();
    first.projects.push(project("project.injected"));
    const second = await store.readProjectIndex();
    await store.requireProject("project.one");
    expect(read).toHaveBeenCalledTimes(1);
    expect(second.projects.map((entry) => entry.id)).toEqual(["project.one"]);
  });

  it("sees this store's own write, and another writer's, at once", async () => {
    const store = new AutomationStudioProjectStore(new AutomationStudioProjectPaths(rootDir));
    await store.writeProjectIndex(() => ({ categories: [], projects: [project("project.one")] }));
    await store.readProjectIndex();
    await store.writeProjectIndex((state) => ({ ...state, projects: [...state.projects, project("project.two")] }));
    expect((await store.readProjectIndex()).projects.map((entry) => entry.id)).toEqual(["project.one", "project.two"]);

    // Another service over the same directory, as a second process would be.
    const other = new ProgramJsonStore<AutomationStudioProjectIndex>(store.indexStore!.filePath, () => ({ categories: [], projects: [] }));
    await other.write({ categories: [], projects: [project("project.three")] });
    expect((await store.readProjectIndex()).projects.map((entry) => entry.id)).toEqual(["project.three"]);
    await expect(store.requireProject("project.one")).rejects.toThrow("Unknown Automation Studio project: project.one");
  });

  it("reads an index that has no file yet every time, and caches nothing for it", async () => {
    const store = new AutomationStudioProjectStore(new AutomationStudioProjectPaths(rootDir));
    const read = vi.spyOn(ProgramJsonStore.prototype, "read");
    await store.readProjectIndex();
    await store.readProjectIndex();
    expect(read).toHaveBeenCalledTimes(2);
  });
});
