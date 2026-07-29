import { randomUUID } from "node:crypto";
import type { AutomationStudioSnapshot } from "../api";
import type { AutomationStudioProject, AutomationStudioProjectCategory, AutomationStudioProjectHierarchy } from "../api/contracts";
import { createAutomationStudioFixture } from "../model";
import { ProgramJsonStore, programDataFile } from "../../_shared/storage";
import {
  type CanonicalAutomationStudioRepositories,
  createCanonicalAutomationStudioMemoryRepositories
} from "../storage";

export type AutomationStudioServiceOptions = {
  dataDir?: string;
  repositories?: CanonicalAutomationStudioRepositories;
  seedFixture?: boolean;
};

type AutomationStudioProjectRecord = AutomationStudioProject & AutomationStudioProjectHierarchy;

type AutomationStudioProjectState = {
  categories: AutomationStudioProjectCategory[];
  projects: AutomationStudioProjectRecord[];
};

export class AutomationStudioService {
  private readonly repositories: CanonicalAutomationStudioRepositories;
  private readonly projectStore?: ProgramJsonStore<AutomationStudioProjectState>;
  private readonly ready: Promise<void>;

  constructor(options: AutomationStudioServiceOptions = {}) {
    this.repositories = options.repositories ?? createCanonicalAutomationStudioMemoryRepositories();
    if (options.dataDir) {
      this.projectStore = new ProgramJsonStore(programDataFile(options.dataDir, "automation-studio", "projects.json"), () => ({ categories: [], projects: [] }));
    }
    this.ready = options.seedFixture === false ? Promise.resolve() : this.seedFixture();
  }

  async snapshot(domainId?: string | null): Promise<AutomationStudioSnapshot> {
    await this.ready;
    return {
      tasks: [],
      recordings: [],
      policies: [],
      canonical: {
        recordingSessions: await this.repositories.recordingSessions.list(domainId),
        normalizedTimelines: await this.repositories.normalizedTimelines.list(domainId),
        signalRegistries: await this.repositories.signalRegistries.list(domainId),
        learnedTaskModels: await this.repositories.learnedTaskModels.list(domainId),
        policyGraphs: await this.repositories.policyGraphs.list(domainId)
      },
      problems: [
        {
          id: "automation-studio.prototype-data",
          severity: "info",
          message: "Automation Studio is showing framework fixture data until host-owned artifacts are connected."
        }
      ]
    };
  }

  async listProjects(): Promise<{ categories: AutomationStudioProjectCategory[]; projects: AutomationStudioProject[] }> {
    const state = await this.readProjectState();
    return {
      categories: this.sortCategories(state.categories ?? []),
      projects: state.projects
        .map(({ customHierarchyNodes: _customHierarchyNodes, deletedHierarchyIds: _deletedHierarchyIds, workspacePrefs: _workspacePrefs, ...project }) => project)
        .sort((left, right) => right.updatedAt - left.updatedAt)
    };
  }

  async createProject(input: { name?: unknown; description?: unknown; categoryId?: unknown }): Promise<AutomationStudioProject> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Project name is required.");
    const now = Date.now();
    const categoryId = typeof input.categoryId === "string" && input.categoryId.trim() ? input.categoryId.trim() : null;
    const project: AutomationStudioProjectRecord = {
      id: randomUUID(),
      name,
      description: typeof input.description === "string" ? input.description.trim() : "",
      categoryId,
      createdAt: now,
      updatedAt: now,
      customHierarchyNodes: [],
      deletedHierarchyIds: [],
      workspacePrefs: {}
    };
    await this.writeProjectState((state) => ({ ...state, projects: [project, ...state.projects] }));
    const { customHierarchyNodes: _customHierarchyNodes, deletedHierarchyIds: _deletedHierarchyIds, workspacePrefs: _workspacePrefs, ...summary } = project;
    return summary;
  }

  async updateProject(input: { projectId?: unknown; name?: unknown; description?: unknown; categoryId?: unknown }): Promise<AutomationStudioProject> {
    const projectId = String(input.projectId ?? "");
    const name = typeof input.name === "string" ? input.name.trim() : undefined;
    if (name !== undefined && !name) throw new Error("Project name is required.");
    let updated: AutomationStudioProjectRecord | undefined;
    await this.writeProjectState((state) => ({
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
    const { customHierarchyNodes: _customHierarchyNodes, deletedHierarchyIds: _deletedHierarchyIds, workspacePrefs: _workspacePrefs, ...summary } = updated;
    return summary;
  }

  async deleteProject(projectId: string): Promise<{ deletedProjectId: string }> {
    await this.findProject(projectId);
    await this.writeProjectState((state) => ({
      ...state,
      projects: state.projects.filter((project) => project.id !== projectId)
    }));
    return { deletedProjectId: projectId };
  }

  async createProjectCategory(input: { name?: unknown }): Promise<AutomationStudioProjectCategory> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Category name is required.");
    const now = Date.now();
    const state = await this.readProjectState();
    const category = { id: randomUUID(), name, order: nextCategoryOrder(state.categories), createdAt: now, updatedAt: now };
    await this.writeProjectState((state) => ({ ...state, categories: [category, ...(state.categories ?? [])] }));
    return category;
  }

  async updateProjectCategory(input: { categoryId?: unknown; name?: unknown }): Promise<AutomationStudioProjectCategory> {
    const categoryId = String(input.categoryId ?? "");
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Category name is required.");
    let updated: AutomationStudioProjectCategory | undefined;
    await this.writeProjectState((state) => ({
      ...state,
      categories: (state.categories ?? []).map((category) => {
        if (category.id !== categoryId) return category;
        updated = { ...category, name, updatedAt: Date.now() };
        return updated;
      })
    }));
    if (!updated) throw new Error(`Unknown Automation Studio project category: ${categoryId}`);
    return updated;
  }

  async deleteProjectCategory(categoryId: string): Promise<{ deletedCategoryId: string }> {
    await this.writeProjectState((state) => ({
      ...state,
      categories: (state.categories ?? []).filter((category) => category.id !== categoryId),
      projects: state.projects.map((project) => project.categoryId === categoryId ? { ...project, categoryId: null, updatedAt: Date.now() } : project)
    }));
    return { deletedCategoryId: categoryId };
  }

  async reorderProjectCategories(categoryIds: string[]): Promise<{ categories: AutomationStudioProjectCategory[] }> {
    const requestedIds = categoryIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim());
    let categories: AutomationStudioProjectCategory[] = [];
    await this.writeProjectState((state) => {
      const requested = new Set(requestedIds);
      const known = new Set((state.categories ?? []).map((category) => category.id));
      if (requestedIds.some((id) => !known.has(id))) throw new Error("Unknown Automation Studio project category in reorder request.");
      const orderedIds = [...requestedIds, ...(state.categories ?? []).filter((category) => !requested.has(category.id)).map((category) => category.id)];
      const orderById = new Map(orderedIds.map((id, index) => [id, index]));
      categories = (state.categories ?? []).map((category) => ({ ...category, order: orderById.get(category.id) ?? category.order, updatedAt: Date.now() }));
      return { ...state, categories };
    });
    return { categories: this.sortCategories(categories) };
  }

  async getProjectHierarchy(projectId: string): Promise<AutomationStudioProjectHierarchy> {
    const project = await this.findProject(projectId);
    return {
      customHierarchyNodes: project.customHierarchyNodes,
      deletedHierarchyIds: project.deletedHierarchyIds,
      workspacePrefs: project.workspacePrefs ?? {}
    };
  }

  async saveProjectHierarchy(projectId: string, hierarchy: AutomationStudioProjectHierarchy): Promise<AutomationStudioProjectHierarchy> {
    const nextHierarchy: AutomationStudioProjectHierarchy = {
      customHierarchyNodes: Array.isArray(hierarchy.customHierarchyNodes) ? hierarchy.customHierarchyNodes : [],
      deletedHierarchyIds: Array.isArray(hierarchy.deletedHierarchyIds) ? hierarchy.deletedHierarchyIds : [],
      workspacePrefs: hierarchy.workspacePrefs && typeof hierarchy.workspacePrefs === "object" && !Array.isArray(hierarchy.workspacePrefs) ? hierarchy.workspacePrefs : {}
    };
    await this.writeProjectState((state) => ({
      ...state,
      projects: state.projects.map((project) => project.id === projectId ? {
        ...project,
        ...nextHierarchy,
        updatedAt: Date.now()
      } : project)
    }));
    return nextHierarchy;
  }

  private async readProjectState(): Promise<AutomationStudioProjectState> {
    const state = this.projectStore ? await this.projectStore.read() : { categories: [], projects: [] };
    return { categories: normalizeProjectCategories(state.categories ?? []), projects: state.projects ?? [] };
  }

  private async writeProjectState(mutator: (state: AutomationStudioProjectState) => AutomationStudioProjectState): Promise<AutomationStudioProjectState> {
    if (!this.projectStore) return mutator({ categories: [], projects: [] });
    return await this.projectStore.update((state) => mutator({ categories: state.categories ?? [], projects: state.projects ?? [] }));
  }

  private sortCategories(categories: AutomationStudioProjectCategory[]): AutomationStudioProjectCategory[] {
    return [...normalizeProjectCategories(categories)].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  }

  private async findProject(projectId: string): Promise<AutomationStudioProjectRecord> {
    const state = await this.readProjectState();
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) throw new Error(`Unknown Automation Studio project: ${projectId}`);
    return project;
  }

  private async seedFixture(): Promise<void> {
    const fixture = createAutomationStudioFixture();
    await this.repositories.recordingSessions.put(fixture.recording);
    await this.repositories.normalizedTimelines.put(fixture.normalizedTimeline);
    await this.repositories.signalRegistries.put(fixture.signalRegistry);
    await this.repositories.learnedTaskModels.put(fixture.learnedTaskModel);
    await this.repositories.policyGraphs.put(fixture.policy);
  }
}

function normalizeProjectCategories(categories: AutomationStudioProjectCategory[]): AutomationStudioProjectCategory[] {
  return categories.map((category, index) => ({
    ...category,
    order: typeof category.order === "number" && Number.isFinite(category.order) ? category.order : index
  }));
}

function nextCategoryOrder(categories: AutomationStudioProjectCategory[]): number {
  if (!categories.length) return 0;
  return Math.max(...normalizeProjectCategories(categories).map((category) => category.order)) + 1;
}
