import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import type { AutomationStudioProject } from "../../../api/contracts.ts";
import type { AutomationStudioObjectStore } from "../../../storage/index.ts";
import type { AutomationStudioProjectIndex } from "./types.ts";
import type { AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "./store.ts";

export type AutomationStudioProjectUpdatePorts = {
  objectStore: AutomationStudioObjectStore | undefined;
  projects: AutomationStudioProjectStore;
  projectPaths: AutomationStudioProjectPaths;
};

/**
 * One project's name, description or category. With an object store and a
 * project index file the write runs inside the index transaction, so the
 * manifest and the index cannot disagree; without one it goes through the
 * project store's own index write.
 */
export async function updateAutomationStudioProject(ports: AutomationStudioProjectUpdatePorts, input: { projectId?: unknown; name?: unknown; description?: unknown; categoryId?: unknown }): Promise<AutomationStudioProject> {
  const projectId = String(input.projectId ?? "");
  const name = typeof input.name === "string" ? input.name.trim() : undefined;
  if (name !== undefined && !name) throw new Error("Project name is required.");
  if (ports.objectStore && ports.projects.indexStore) {
    return await ProgramJsonStore.transaction(ports.projects.indexStore.filePath, async (transaction) => {
      const state = await transaction.read(ports.projects.indexStore!.filePath, () => ({ categories: [], projects: [] } as AutomationStudioProjectIndex));
      const current = state.projects.find((project) => project.id === projectId);
      if (!current) throw new Error(`Unknown Automation Studio project: ${projectId}`);
      const updated = {
        ...current,
        ...(name !== undefined ? { name } : {}),
        ...(typeof input.description === "string" ? { description: input.description.trim() } : {}),
        ...(input.categoryId !== undefined ? { categoryId: typeof input.categoryId === "string" && input.categoryId.trim() ? input.categoryId.trim() : null } : {}),
        updatedAt: Date.now()
      };
      await transaction.write(ports.projects.indexStore!.filePath, { ...state, projects: state.projects.map((project) => project.id === projectId ? updated : project) });
      await transaction.write(ports.projectPaths.projectFile(projectId, "manifest.json"), updated);
      return updated;
    });
  }
  let updated: AutomationStudioProject | undefined;
  await ports.projects.writeProjectIndex((state) => ({
    ...state,
    projects: state.projects.map((project) => {
      if (project.id !== projectId) return project;
      updated = {
        ...project,
        ...(name !== undefined ? { name } : {}),
        ...(typeof input.description === "string" ? { description: input.description.trim() } : {}),
        ...(input.categoryId !== undefined ? { categoryId: typeof input.categoryId === "string" && input.categoryId.trim() ? input.categoryId.trim() : null } : {}),
        updatedAt: Date.now()
      };
      return updated;
    })
  }));
  if (!updated) throw new Error(`Unknown Automation Studio project: ${projectId}`);
  const existing = await ports.projects.findProject(projectId);
  await ports.projects.writeProjectRecord({ ...existing, ...updated });
  return updated;
}
