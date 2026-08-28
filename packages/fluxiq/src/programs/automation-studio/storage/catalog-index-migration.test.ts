import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioCatalog } from "./catalog.ts";
import { migrateAutomationStudioLegacyProjectCatalog } from "./catalog-index-migration.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-catalog-index-migration-test");

describe("migrateAutomationStudioLegacyProjectCatalog", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(path.join(rootDir, "projects"), { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("moves legacy project categories and projects into the typed global catalog", async () => {
    await writeFile(path.join(rootDir, "projects", "index.json"), JSON.stringify({
      categories: [{ id: "cat.ops", name: "Ops", domainId: null, order: 0, createdAt: 1, updatedAt: 1 }],
      projects: [
        { id: "project.one", name: "One", description: "First", domainId: null, categoryId: "cat.ops", createdAt: 2, updatedAt: 3 },
        { id: "project.orphan", name: "Orphan", description: "", domainId: "domain.a", categoryId: "missing", createdAt: 4, updatedAt: 5 }
      ]
    }));
    const catalog = await AutomationStudioCatalog.open({ rootDir });
    await expect(migrateAutomationStudioLegacyProjectCatalog({ rootDir, catalog })).resolves.toEqual({ importedCategories: 1, importedProjects: 2, skippedCategories: 0, skippedProjects: 0 });
    await expect(catalog.categories.list()).resolves.toMatchObject({ items: [{ id: "cat.ops", name: "Ops" }] });
    await expect(catalog.projects.get("project.one")).resolves.toMatchObject({ categoryId: "cat.ops", storagePath: path.join(rootDir, "projects", "project.one") });
    await expect(catalog.projects.get("project.orphan")).resolves.toMatchObject({ categoryId: null, domainId: "domain.a" });
    await expect(catalog.projects.list({ domainId: "domain.a" })).resolves.toMatchObject({ items: [{ id: "project.orphan" }] });
    await catalog.close();
  });

  it("resumes idempotently through typed catalog upserts", async () => {
    await writeFile(path.join(rootDir, "projects", "index.json"), JSON.stringify({
      categories: [{ id: "cat.ops", name: "Ops", domainId: null, order: 0, createdAt: 1, updatedAt: 1 }],
      projects: [{ id: "project.one", name: "One", description: "First", domainId: null, categoryId: "cat.ops", createdAt: 2, updatedAt: 3 }]
    }));
    const catalog = await AutomationStudioCatalog.open({ rootDir });
    await migrateAutomationStudioLegacyProjectCatalog({ rootDir, catalog });
    await expect(migrateAutomationStudioLegacyProjectCatalog({ rootDir, catalog })).resolves.toEqual({ importedCategories: 0, importedProjects: 0, skippedCategories: 1, skippedProjects: 1 });
    await catalog.close();
  });
});

