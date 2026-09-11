import { rm } from "node:fs/promises";
import { ProgramJsonStore, safeSegment } from "../../../../_shared/storage.ts";
import type { AutomationStudioProject, AutomationStudioProjectHierarchy } from "../../../api/contracts.ts";
import type {
  AutomationStudioProjectArtifactKind,
  AutomationStudioRoutineArtifact,
  AutomationStudioTaskArtifact
} from "../../../model/index.ts";
import type { AutomationStudioObjectStore, CanonicalAutomationStudioRepositories } from "../../../storage/index.ts";
import { uniqueStrings } from "../collections.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";
import type { AutomationStudioFlowWriter } from "../flows/index.ts";
import type { AutomationStudioLegacyRetirementStore } from "../legacy/index.ts";
import type { AutomationStudioObjectDocuments } from "../object-documents.ts";
import type { AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "./store.ts";
import type { AutomationStudioProjectIndex } from "./types.ts";

function hierarchyFeedRevision(hierarchy: AutomationStudioProjectHierarchy, changedAt: number): number {
  return Math.max(1, Math.trunc(Math.max(changedAt, hierarchy.customHierarchyNodes.length + hierarchy.deletedHierarchyIds.length)));
}

// Project-scoped artifacts that are not Flows: deleting one and everything it
// owns, and the custom hierarchy a project lays over them. Both write through
// the project index transaction rather than the artifact files alone, so a
// half-applied delete cannot leave the index describing something that is gone.
export class AutomationStudioProjectArtifactStore {
  constructor(
    private readonly projectPaths: AutomationStudioProjectPaths,
    private readonly projects: AutomationStudioProjectStore,
    private readonly legacy: AutomationStudioLegacyRetirementStore,
    private readonly objectDocuments: AutomationStudioObjectDocuments,
    private readonly repositories: CanonicalAutomationStudioRepositories,
    private readonly flowWriter: AutomationStudioFlowWriter,
    private readonly facade: AutomationStudioFacadePorts,
    private readonly objectStore: AutomationStudioObjectStore | undefined
  ) {}

  async deleteProjectArtifact(input: { projectId: string; kind: AutomationStudioProjectArtifactKind; artifactId: string; deleteOwnedArtifacts?: boolean }): Promise<{ deleted: boolean; projectId: string; kind: AutomationStudioProjectArtifactKind; artifactId: string; deletedArtifactIds: string[] }> {
    await this.projects.findProject(input.projectId);
    if (input.kind !== "config") await this.legacy.assertLegacyWriteAllowed(input.projectId);
    const artifactId = input.artifactId.trim();
    if (!artifactId) throw new Error(`${input.kind} ID is required.`);
    const deletedArtifactIds = new Set<string>([`${input.kind}:${artifactId}`]);
    const artifact = await this.facade.getProjectArtifact(input.projectId, input.kind, artifactId).catch(() => null);
    if (input.deleteOwnedArtifacts && artifact && typeof artifact === "object") {
      const projectArtifacts = await this.facade.listProjectArtifacts(input.projectId);
      if (input.kind === "task") {
        const task = artifact as AutomationStudioTaskArtifact;
        const flowIds = uniqueStrings([
          ...(typeof task.graphId === "string" ? [task.graphId] : []),
          ...(typeof task.policyFlowId === "string" ? [task.policyFlowId] : []),
          ...projectArtifacts.flows.filter((flow) => flow.ownerKind === "task" && flow.ownerId === artifactId).map((flow) => flow.flowId)
        ]);
        for (const flowId of flowIds) {
          await this.objectDocuments.deleteProjectArtifactFile(input.projectId, "flow", flowId);
          deletedArtifactIds.add(`flow:${flowId}`);
        }
        const policyId = typeof task.metadata?.policyId === "string" ? task.metadata.policyId : null;
        if (policyId) {
          await this.repositories.policyGraphs.delete(policyId).catch(() => false);
          if (this.projectPaths.root) {
            const policyPath = this.projectPaths.projectFile(input.projectId, "policies", `${safeSegment(policyId)}.json`);
            if (this.objectStore) await ProgramJsonStore.deletePath(policyPath);
            else await rm(policyPath, { force: true });
          }
          deletedArtifactIds.add(`policy:${policyId}`);
        }
      }
      if (input.kind === "routine") {
        const routine = artifact as AutomationStudioRoutineArtifact;
        const flowIds = uniqueStrings([
          ...(typeof routine.flowId === "string" ? [routine.flowId] : []),
          ...projectArtifacts.flows.filter((flow) => flow.ownerKind === "routine" && flow.ownerId === artifactId).map((flow) => flow.flowId)
        ]);
        for (const flowId of flowIds) {
          await this.objectDocuments.deleteProjectArtifactFile(input.projectId, "flow", flowId);
          deletedArtifactIds.add(`flow:${flowId}`);
        }
      }
    }
    await this.objectDocuments.deleteProjectArtifactFile(input.projectId, input.kind, artifactId);
    return { deleted: true, projectId: input.projectId, kind: input.kind, artifactId, deletedArtifactIds: [...deletedArtifactIds] };
  }

  async saveProjectHierarchy(projectId: string, hierarchy: AutomationStudioProjectHierarchy): Promise<AutomationStudioProjectHierarchy> {
    const nextHierarchy: AutomationStudioProjectHierarchy = {
      customHierarchyNodes: Array.isArray(hierarchy.customHierarchyNodes) ? hierarchy.customHierarchyNodes : [],
      deletedHierarchyIds: Array.isArray(hierarchy.deletedHierarchyIds) ? hierarchy.deletedHierarchyIds : [],
      workspacePrefs: hierarchy.workspacePrefs && typeof hierarchy.workspacePrefs === "object" && !Array.isArray(hierarchy.workspacePrefs) ? hierarchy.workspacePrefs : {}
    };
    const changedAt = Date.now();
    if (this.objectStore && this.projects.indexStore) {
      await ProgramJsonStore.transaction(this.projects.indexStore.filePath, async (transaction) => {
        const state = await transaction.read(this.projects.indexStore!.filePath, () => ({ categories: [], projects: [] } as AutomationStudioProjectIndex));
        const current = state.projects.find((project) => project.id === projectId);
        if (!current) throw new Error(`Unknown Automation Studio project: ${projectId}`);
        const updated = { ...current, updatedAt: changedAt };
        await transaction.write(this.projects.indexStore!.filePath, { ...state, projects: state.projects.map((project) => project.id === projectId ? updated : project) });
        await transaction.write(this.projectPaths.projectFile(projectId, "manifest.json"), updated);
        await transaction.write(this.projectPaths.projectFile(projectId, "hierarchy", "nodes.json"), { customHierarchyNodes: nextHierarchy.customHierarchyNodes });
        await transaction.write(this.projectPaths.projectFile(projectId, "hierarchy", "deleted.json"), { deletedHierarchyIds: nextHierarchy.deletedHierarchyIds });
        await transaction.write(this.projectPaths.projectFile(projectId, "workspace", "preferences.json"), { workspacePrefs: nextHierarchy.workspacePrefs });
      });
      await this.flowWriter.appendProjectMutationChangeFeed({
        projectId,
        entityKind: "hierarchy",
        entityId: projectId,
        operation: "update",
        revision: hierarchyFeedRevision(nextHierarchy, changedAt),
        changedAt,
        hierarchyScope: { kind: "project", id: projectId }
      });
      return nextHierarchy;
    }
    let updatedProject: AutomationStudioProject | undefined;
    await this.projects.writeProjectIndex((state) => ({
      ...state,
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        updatedProject = { ...project, updatedAt: changedAt };
        return updatedProject;
      })
    }));
    if (!updatedProject) throw new Error(`Unknown Automation Studio project: ${projectId}`);
    await this.projects.writeProjectRecord({ ...updatedProject, ...nextHierarchy });
    await this.flowWriter.appendProjectMutationChangeFeed({
      projectId,
      entityKind: "hierarchy",
      entityId: projectId,
      operation: "update",
      revision: hierarchyFeedRevision(nextHierarchy, changedAt),
      changedAt,
      hierarchyScope: { kind: "project", id: projectId }
    });
    return nextHierarchy;
  }
}
