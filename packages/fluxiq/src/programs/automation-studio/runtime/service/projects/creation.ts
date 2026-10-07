import { randomUUID } from "node:crypto";
import path from "node:path";
import type { AutomationStudioProject } from "../../../api/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import type { AutomationStudioObjectStore } from "../../../storage/index.ts";
import { CanonicalAuthorityWholeOperation, CanonicalAuthorityValidation as V, type CanonicalWholeEffectKind } from "../../../storage/canonical-authority/index.ts";
import type { AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "./store.ts";
import type { AutomationStudioProjectIndex, AutomationStudioProjectRecord } from "./types.ts";

/** Actual generated-project owner; ordinary creation never seeds an existing original ID. */
export class AutomationStudioProjectCreation {
  constructor(private readonly projects: AutomationStudioProjectStore, private readonly paths: AutomationStudioProjectPaths, private readonly objectStore?: AutomationStudioObjectStore, private readonly authority?: CanonicalAuthorityWholeOperation) {}
  async createProject(input: { name?: unknown; description?: unknown; categoryId?: unknown; domainId?: unknown }): Promise<AutomationStudioProject> {
    const name = typeof input.name === "string" ? input.name.trim() : ""; if (!name) throw new Error("Project name is required.");
    const now = Date.now(), fields = { name, description: typeof input.description === "string" ? input.description.trim() : "", categoryId: typeof input.categoryId === "string" && input.categoryId.trim() ? input.categoryId.trim() : null, domainId: typeof input.domainId === "string" && input.domainId.trim() ? input.domainId.trim() : null, createdAt: now, updatedAt: now };
    if (this.authority) return this.authority.createProject(fields, async id => {
      if (!this.paths.root || path.resolve(this.paths.root) !== this.authority!.options.projectRootDir) throw new Error("canonical_whole.project_paths");
      const project = { id, ...fields }, old = await this.authority!.catalogueIndex();
      if ((old.projects as JsonObject[]).some(item => item.id === id)) throw new Error("canonical_whole.project_allocated");
      const next = { ...old, projects: [project, ...(old.projects as JsonObject[])] };
      const documents: Array<[CanonicalWholeEffectKind, string[], JsonObject]> = [
        ["catalogue_membership", ["index.json"], next],
        ["project_manifest", ["manifest.json"], project],
        ["project_hierarchy_nodes", ["hierarchy", "nodes.json"], { customHierarchyNodes: [] }],
        ["project_hierarchy_deleted", ["hierarchy", "deleted.json"], { deletedHierarchyIds: [] }],
        ["project_preferences", ["workspace", "preferences.json"], { workspacePrefs: {} }]
      ];
      await this.authority!.globalEffects(documents.map(([effectKind, , expected]) => ({ effectKind, entityId: id, expected })), async sql => {
        if (V.digest(await this.authority!.catalogue.index(sql)) !== V.digest(old)) throw new Error("canonical_whole.catalogue_conflict");
        const actual: JsonObject[] = [];
        for (const [kind, parts, document] of documents) actual.push(await this.authority!.catalogue.write(sql, kind === "catalogue_membership" ? this.authority!.catalogue.indexPath : this.paths.projectFile(id, ...parts), document));
        return actual;
      });
      return project;
    });
    const project: AutomationStudioProject = { id: randomUUID(), ...fields }, record: AutomationStudioProjectRecord = { ...project, customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} };
    if (this.objectStore && this.projects.indexStore) {
      await ProgramJsonStore.transaction(this.projects.indexStore.filePath, async transaction => {
        const state = await transaction.read(this.projects.indexStore!.filePath, () => ({ categories: [], projects: [] } as AutomationStudioProjectIndex));
        await transaction.write(this.projects.indexStore!.filePath, { ...state, projects: [project, ...state.projects] });
        await transaction.write(this.paths.projectFile(project.id, "manifest.json"), project);
        await transaction.write(this.paths.projectFile(project.id, "hierarchy", "nodes.json"), { customHierarchyNodes: [] });
        await transaction.write(this.paths.projectFile(project.id, "hierarchy", "deleted.json"), { deletedHierarchyIds: [] });
        await transaction.write(this.paths.projectFile(project.id, "workspace", "preferences.json"), { workspacePrefs: {} });
      });
    } else { await this.projects.writeProjectIndex(state => ({ ...state, projects: [project, ...state.projects] })); await this.projects.writeProjectRecord(record); }
    return project;
  }
}
