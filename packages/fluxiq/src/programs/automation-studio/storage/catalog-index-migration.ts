import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AutomationStudioProject, AutomationStudioProjectCategory } from "../api/contracts.ts";
import { AutomationStudioCatalog } from "./catalog.ts";

export type AutomationStudioLegacyProjectCatalogIndex = {
  categories?: AutomationStudioProjectCategory[];
  projects?: AutomationStudioProject[];
};

export type AutomationStudioLegacyProjectCatalogMigrationResult = {
  importedCategories: number;
  importedProjects: number;
  skippedCategories: number;
  skippedProjects: number;
};

export async function migrateAutomationStudioLegacyProjectCatalog(input: { rootDir: string; catalog: AutomationStudioCatalog; indexPath?: string }): Promise<AutomationStudioLegacyProjectCatalogMigrationResult> {
  const indexPath = input.indexPath ?? path.join(input.rootDir, "projects", "index.json");
  const content = await readFile(indexPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  if (!content) return { importedCategories: 0, importedProjects: 0, skippedCategories: 0, skippedProjects: 0 };
  const index = JSON.parse(content) as AutomationStudioLegacyProjectCatalogIndex;
  const result: AutomationStudioLegacyProjectCatalogMigrationResult = { importedCategories: 0, importedProjects: 0, skippedCategories: 0, skippedProjects: 0 };
  const categories = normalizeCategories(index.categories ?? []);
  for (const category of categories) {
    const existing = await input.catalog.categories.get(category.id);
    await input.catalog.categories.put({ id: category.id, name: category.name, domainId: category.domainId ?? null, order: category.order, createdAt: category.createdAt, updatedAt: category.updatedAt });
    if (existing) result.skippedCategories += 1;
    else result.importedCategories += 1;
  }
  const categoryIds = new Set(categories.map((category) => category.id));
  for (const project of index.projects ?? []) {
    const normalized = normalizeProject(project, input.rootDir, categoryIds);
    const existing = await input.catalog.projects.get(normalized.id);
    await input.catalog.projects.put(normalized);
    if (existing) result.skippedProjects += 1;
    else result.importedProjects += 1;
  }
  return result;
}

function normalizeCategories(categories: AutomationStudioProjectCategory[]): AutomationStudioProjectCategory[] {
  return categories.map((category, index) => ({ ...category, id: requiredId(category.id, "category"), name: requiredName(category.name, "Category"), domainId: category.domainId ?? null, order: Number.isFinite(category.order) ? category.order : index, createdAt: finiteTimestamp(category.createdAt), updatedAt: finiteTimestamp(category.updatedAt) }));
}

function normalizeProject(project: AutomationStudioProject, rootDir: string, categoryIds: Set<string>) {
  const id = requiredId(project.id, "project");
  const categoryId = project.categoryId && categoryIds.has(project.categoryId) ? project.categoryId : null;
  return {
    id,
    name: requiredName(project.name, "Project"),
    description: project.description ?? "",
    domainId: project.domainId ?? null,
    categoryId,
    storagePath: path.join(rootDir, "projects", id),
    status: "active" as const,
    createdAt: finiteTimestamp(project.createdAt),
    updatedAt: finiteTimestamp(project.updatedAt)
  };
}

function requiredId(value: string, kind: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`); return id; }
function requiredName(value: string, kind: string): string { const name = value.trim(); if (!name || name.length > 200) throw new Error(`${kind} name is required and must not exceed 200 characters.`); return name; }
function finiteTimestamp(value: number): number { return Number.isFinite(value) ? Math.trunc(value) : Date.now(); }

