import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioCatalog } from "./catalog.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-catalog-test");

describe("AutomationStudioCatalog", () => {
  beforeEach(async () => { await rm(rootDir, { recursive: true, force: true }); await mkdir(rootDir, { recursive: true }); });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("persists typed categories and projects across reopen with optimistic revisions", async () => {
    let catalog = await AutomationStudioCatalog.open({ rootDir });
    const category = await catalog.categories.put({ id: "category.ops", name: "Operations", domainId: null, order: 1 });
    const project = await catalog.projects.put({ id: "project.one", name: "One", description: "First", domainId: null, categoryId: category.id, storagePath: "projects/project.one", status: "active" });
    expect(project.revision).toBe(1);
    await expect(catalog.projects.put({ ...project, name: "Changed" }, 99)).rejects.toThrow(/revision conflict/);
    const updated = await catalog.projects.put({ ...project, name: "Changed" }, 1);
    expect(updated).toMatchObject({ name: "Changed", revision: 2 });
    await catalog.close();
    catalog = await AutomationStudioCatalog.open({ rootDir });
    await expect(catalog.projects.get(project.id)).resolves.toMatchObject({ name: "Changed", categoryId: category.id, revision: 2 });
    await catalog.close();
  });

  it("uses stable keyset cursors without duplicates", async () => {
    const catalog = await AutomationStudioCatalog.open({ rootDir });
    for (let index = 0; index < 7; index += 1) {
      await catalog.projects.put({ id: `project.${index}`, name: `Project ${index}`, description: "", domainId: null, categoryId: null, storagePath: `projects/project.${index}`, status: "active", updatedAt: 1_000 + index });
    }
    const first = await catalog.projects.list({ limit: 3 });
    const second = await catalog.projects.list({ limit: 3, cursor: first.nextCursor });
    const third = await catalog.projects.list({ limit: 3, cursor: second.nextCursor });
    const ids = [...first.items, ...second.items, ...third.items].map((project) => project.id);
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
    expect(first.hasMore).toBe(true);
    expect(third.hasMore).toBe(false);
    await catalog.close();
  });

  it("sets project category to null when its category is deleted", async () => {
    const catalog = await AutomationStudioCatalog.open({ rootDir });
    await catalog.categories.put({ id: "category.delete", name: "Delete", domainId: null, order: 0 });
    await catalog.projects.put({ id: "project.child", name: "Child", description: "", domainId: null, categoryId: "category.delete", storagePath: "projects/project.child", status: "active" });
    await expect(catalog.categories.delete("category.delete")).resolves.toBe(true);
    await expect(catalog.projects.get("project.child")).resolves.toMatchObject({ categoryId: null });
    await catalog.close();
  });
});
