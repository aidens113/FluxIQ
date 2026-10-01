import { stat } from "node:fs/promises";
import path from "node:path";
import type { AutomationStudioProject, AutomationStudioProjectCategory, AutomationStudioProjectHierarchy } from "../../../api/index.ts";
import { ProgramJsonStore, programDataFile } from "../../../../_shared/storage.ts";
import type { AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectIndex, AutomationStudioProjectRecord } from "./types.ts";

// The project catalogue: the index that lists every project, the per-project
// manifest and hierarchy documents, and the one-time migration off the legacy
// store. It owns the storage handles; the storage root itself belongs to the
// paths collaborator, which this one reads it from.
export class AutomationStudioProjectStore {
  readonly indexStore?: ProgramJsonStore<AutomationStudioProjectIndex>;
  private readonly legacyStore?: ProgramJsonStore<{ categories: AutomationStudioProjectCategory[]; projects: AutomationStudioProjectRecord[] }>;
  private storageReady?: Promise<void>;
  // A service with no storage root keeps its project catalogue here, for its
  // own lifetime. Without it every write was answered and then forgotten, so a
  // project created on the default service could not be found the next moment.
  private memoryIndex: AutomationStudioProjectIndex = { categories: [], projects: [] };
  // The index as last read, keyed by the file's identity (its id, size and
  // modification time, to the nanosecond). Nearly every service operation
  // reads the index to check its project, 170-220 times in one repaired run,
  // measured; a file whose identity has not changed is not read again. A write
  // replaces the file, which changes its id, and this store's own writes
  // forget the copy outright. An index kept in SQLite is always read.
  private indexCache: { identity: string; state: AutomationStudioProjectIndex } | undefined;

  constructor(private readonly paths: AutomationStudioProjectPaths, legacyDataDir?: string) {
    if (this.paths.root) this.indexStore = new ProgramJsonStore(path.join(this.paths.root, "index.json"), () => ({ categories: [], projects: [] }));
    if (legacyDataDir) this.legacyStore = new ProgramJsonStore(programDataFile(legacyDataDir, "automation-studio", "projects.json"), () => ({ categories: [], projects: [] }));
  }

  async readProjectIndex(): Promise<AutomationStudioProjectIndex> {
    await this.ensureStorageReady();
    const state = this.indexStore ? await this.readIndexFile(this.indexStore) : structuredClone(this.memoryIndex);
    return { categories: normalizeProjectCategories(state.categories ?? []), projects: state.projects ?? [] };
  }

  private async readIndexFile(store: ProgramJsonStore<AutomationStudioProjectIndex>): Promise<AutomationStudioProjectIndex> {
    // The identity is taken before the read. A write landing between the two
    // leaves newer content under the older identity, which the next stat no
    // longer matches, so it is read again rather than served stale.
    // A document kept in SQLite may leave a stale file behind, whose identity
    // would never change, so only a file-backed index is cached.
    const identity = store.isFileBacked() ? await fileIdentity(store.filePath) : null;
    if (identity && this.indexCache?.identity === identity) return structuredClone(this.indexCache.state);
    const state = await store.read();
    this.indexCache = identity ? { identity, state: structuredClone(state) } : undefined;
    return state;
  }

  async writeProjectIndex(mutator: (state: AutomationStudioProjectIndex) => AutomationStudioProjectIndex): Promise<AutomationStudioProjectIndex> {
    await this.ensureStorageReady();
    this.indexCache = undefined;
    if (!this.indexStore) {
      const next = mutator({ categories: normalizeProjectCategories(this.memoryIndex.categories ?? []), projects: structuredClone(this.memoryIndex.projects ?? []) });
      this.memoryIndex = structuredClone(next);
      return next;
    }
    return await this.indexStore.update((state) => mutator({ categories: normalizeProjectCategories(state.categories ?? []), projects: state.projects ?? [] }));
  }

  sortCategories(categories: AutomationStudioProjectCategory[]): AutomationStudioProjectCategory[] {
    return [...normalizeProjectCategories(categories)].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  }

  // Throws exactly as `findProject` does for a project the catalogue does not
  // list, and reads nothing else. Nearly every service operation checks its
  // project first; `findProject` also reads the project's four hierarchy and
  // workspace documents, so each of those checks cost five file reads for a
  // value it discarded -- about 1,700 of the 2,800 file reads a repaired run
  // made in a unit test, measured.
  async requireProject(projectId: string): Promise<void> {
    await this.findProjectSummary(projectId);
  }

  async findProject(projectId: string): Promise<AutomationStudioProjectRecord> {
    return await this.readProjectRecord(await this.findProjectSummary(projectId));
  }

  async findProjectSummary(projectId: string): Promise<AutomationStudioProject> {
    const state = await this.readProjectIndex();
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) throw new Error(`Unknown Automation Studio project: ${projectId}`);
    return project;
  }

  async readProjectRecord(project: AutomationStudioProject): Promise<AutomationStudioProjectRecord> {
    if (!this.paths.root) return { ...project, customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} };
    await this.ensureProjectStructure(project.id);
    const legacyHierarchy = await new ProgramJsonStore<AutomationStudioProjectHierarchy>(this.paths.projectFile(project.id, "hierarchy", "index.json"), () => ({ customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} })).read();
    const nodes = await new ProgramJsonStore<{ customHierarchyNodes: AutomationStudioProjectHierarchy["customHierarchyNodes"] }>(this.paths.projectFile(project.id, "hierarchy", "nodes.json"), () => ({ customHierarchyNodes: legacyHierarchy.customHierarchyNodes ?? [] })).read();
    const deleted = await new ProgramJsonStore<{ deletedHierarchyIds: string[] }>(this.paths.projectFile(project.id, "hierarchy", "deleted.json"), () => ({ deletedHierarchyIds: legacyHierarchy.deletedHierarchyIds ?? [] })).read();
    const workspace = await new ProgramJsonStore<{ workspacePrefs: AutomationStudioProjectHierarchy["workspacePrefs"] }>(this.paths.projectFile(project.id, "workspace", "preferences.json"), () => ({ workspacePrefs: legacyHierarchy.workspacePrefs ?? {} })).read();
    return {
      ...project,
      customHierarchyNodes: Array.isArray(nodes.customHierarchyNodes) ? nodes.customHierarchyNodes : [],
      deletedHierarchyIds: Array.isArray(deleted.deletedHierarchyIds) ? deleted.deletedHierarchyIds : [],
      workspacePrefs: workspace.workspacePrefs && typeof workspace.workspacePrefs === "object" && !Array.isArray(workspace.workspacePrefs) ? workspace.workspacePrefs : {}
    };
  }

  async writeProjectRecord(project: AutomationStudioProjectRecord): Promise<void> {
    if (!this.paths.root) return;
    await this.ensureProjectStructure(project.id);
    const { customHierarchyNodes, deletedHierarchyIds, workspacePrefs, ...manifest } = project;
    await new ProgramJsonStore(this.paths.projectFile(project.id, "manifest.json"), () => ({})).write(manifest);
    await new ProgramJsonStore<{ customHierarchyNodes: AutomationStudioProjectHierarchy["customHierarchyNodes"] }>(this.paths.projectFile(project.id, "hierarchy", "nodes.json"), () => ({ customHierarchyNodes: [] })).write({ customHierarchyNodes });
    await new ProgramJsonStore<{ deletedHierarchyIds: string[] }>(this.paths.projectFile(project.id, "hierarchy", "deleted.json"), () => ({ deletedHierarchyIds: [] })).write({ deletedHierarchyIds });
    await new ProgramJsonStore<{ workspacePrefs: AutomationStudioProjectHierarchy["workspacePrefs"] }>(this.paths.projectFile(project.id, "workspace", "preferences.json"), () => ({ workspacePrefs: {} })).write({ workspacePrefs });
  }

  async ensureProjectStructure(projectId: string): Promise<void> {
    // ProgramJsonStore creates only the parent needed by an actual write.
  }

  private async migrateLegacyProjectStore(): Promise<void> {
    if (!this.indexStore || !this.legacyStore) return;
    const index = await this.indexStore.read();
    if (index.projects.length > 0 || index.categories.length > 0) return;
    const legacy = await this.legacyStore.read();
    if (!legacy.projects.length && !legacy.categories.length) return;
    await this.indexStore.write({
      categories: normalizeProjectCategories(legacy.categories ?? []),
      projects: legacy.projects.map(({ customHierarchyNodes: _customHierarchyNodes, deletedHierarchyIds: _deletedHierarchyIds, workspacePrefs: _workspacePrefs, ...project }) => project)
    });
    for (const project of legacy.projects) await this.writeProjectRecord(project);
  }

  private async prepareStorage(): Promise<void> {
    await this.ensureNodeLibraryStructure();
    await this.migrateLegacyProjectStore();
  }

  private async ensureStorageReady(): Promise<void> {
    this.storageReady ??= this.prepareStorage();
    await this.storageReady;
  }

  private async ensureNodeLibraryStructure(): Promise<void> {
    // Importer-owned custom-node source roots are read lazily. Built-in node
    // classes are code registrations and do not need placeholder directories.
  }
}

export function normalizeProjectCategories(categories: AutomationStudioProjectCategory[]): AutomationStudioProjectCategory[] {
  return categories.map((category, index) => ({
    ...category,
    order: typeof category.order === "number" && Number.isFinite(category.order) ? category.order : index
  }));
}

/** The file's id, size and modification time, or null when there is no file. */
async function fileIdentity(filePath: string): Promise<string | null> {
  try {
    const info = await stat(filePath, { bigint: true });
    return `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
