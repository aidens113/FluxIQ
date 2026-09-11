import type { AutomationStudioProject, AutomationStudioProjectCategory } from "../../api/contracts.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowPublicationRecord } from "../../model/index.ts";
import { type CanonicalAutomationStudioRepositories, emptyFlowSummaryIndex } from "../../storage/index.ts";
import type { AutomationStudioProjectPaths } from "./paths/index.ts";
import type { AutomationStudioProjectStore } from "./projects/index.ts";
import type { AutomationStudioServiceIndexes } from "./indexes/index.ts";
import type { AutomationStudioFlowStore } from "./flows/index.ts";

// Reading the catalogue: which projects exist, which Flows each one holds,
// and which of those are canonical, published or publication records. The
// project list is here because Flow scoping is derived from it.
export class AutomationStudioCatalogue {
  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly projects: AutomationStudioProjectStore,
    private readonly indexes: AutomationStudioServiceIndexes,
    private readonly flows: AutomationStudioFlowStore,
    private readonly repositories: CanonicalAutomationStudioRepositories
  ) {}

  async listProjects(domainId?: string | null): Promise<{ categories: AutomationStudioProjectCategory[]; projects: AutomationStudioProject[] }> {
    const state = await this.projects.readProjectIndex();
    const inferredScopes = await this.inferLegacyProjectScopes(state.projects);
    const projects = state.projects.map((project) => project.domainId === undefined && inferredScopes.has(project.id)
      ? { ...project, domainId: inferredScopes.get(project.id)! }
      : project);
    return {
      categories: this.projects.sortCategories((state.categories ?? []).filter((category) => (category.domainId ?? null) === (domainId ?? null))),
      projects: projects
        .filter((project) => (project.domainId ?? null) === (domainId ?? null))
        .sort((left, right) => right.updatedAt - left.updatedAt)
    };
  }

  async listCanonicalFlowArtifacts(projectId: string): Promise<AutomationStudioFlowArtifact[]> {
    if (!this.paths.root) return (await this.repositories.flows.list()).filter((flow) => flow.projectId === projectId);
    const index = await this.indexes.readFlowIndex(projectId).catch(() => emptyFlowSummaryIndex());
    const flows: AutomationStudioFlowArtifact[] = [];
    for (const item of index.flows ?? []) {
      await this.flows.loadProjectFlow(projectId, item.flowId);
      const flow = await this.repositories.flows.get(item.flowId);
      if (flow?.projectId === projectId) flows.push(flow);
    }
    return flows;
  }

  async listPublishedFlowSnapshots(projectId?: string) {
    return (await this.listFlowPublicationRecords(projectId)).map((record) => record.snapshot);
  }

  async listFlowPublicationRecords(projectId?: string): Promise<AutomationStudioFlowPublicationRecord[]> {
    if (projectId) {
      for (const scopedProjectId of await this.scopedProjectIdsForProject(projectId)) await this.loadProjectFlows(scopedProjectId);
    } else {
      await this.loadAllProjectFlows();
    }
    const scopedProjectIds = projectId ? new Set(await this.scopedProjectIdsForProject(projectId)) : null;
    const persisted = await this.repositories.flowPublications.list();
    const byId = new Map(persisted
      .filter((record) => !scopedProjectIds || scopedProjectIds.has(record.projectId))
      .map((record) => [record.publicationId, record]));
    const candidateFlows = scopedProjectIds
      ? (await Promise.all([...scopedProjectIds].flatMap(async (scopedProjectId) => this.listCanonicalFlowArtifacts(scopedProjectId)))).flat()
      : await this.repositories.flows.list();
    for (const flow of candidateFlows) {
      const history = flow.publicationHistory ?? ((flow.publication.status === "published" || flow.publication.status === "deprecated") && flow.publication.snapshot ? [flow.publication.snapshot] : []);
      for (const snapshot of history) {
        const publicationId = flowPublicationId(flow.flowId, snapshot.version);
        if (!byId.has(publicationId)) byId.set(publicationId, { schemaVersion: "0.1", publicationId, projectId: flow.projectId, flowId: flow.flowId, version: snapshot.version, status: (flow.publication.status === "deprecated" && flow.publication.version === snapshot.version) ? "deprecated" : "published", snapshot, createdAt: snapshot.publishedAt });
      }
    }
    return [...byId.values()];
  }

  async loadProjectFlows(projectId: string): Promise<void> {
    if (!this.paths.root) return;
    const index = await this.indexes.readFlowIndex(projectId).catch(() => emptyFlowSummaryIndex());
    for (const item of index.flows ?? []) await this.flows.loadProjectFlow(projectId, item.flowId);
  }

  async loadAllProjectFlows(): Promise<void> {
    if (!this.paths.root) return;
    const { projects } = await this.listProjects();
    for (const project of projects) await this.loadProjectFlows(project.id);
  }

  async scopedProjectIdsForProject(projectId: string): Promise<string[]> {
    const state = await this.projects.readProjectIndex();
    const project = state.projects.find((candidate) => candidate.id === projectId);
    const domainId = project?.domainId ?? null;
    return state.projects.filter((candidate) => (candidate.domainId ?? null) === domainId).map((candidate) => candidate.id);
  }

  async inferLegacyProjectScopes(projects: AutomationStudioProject[]): Promise<Map<string, string>> {
    const legacyIds = new Set(projects.filter((project) => project.domainId === undefined).map((project) => project.id));
    if (!legacyIds.size) return new Map();
    const domainsByProject = new Map<string, Set<string>>();
    for (const recording of await this.repositories.recordingSessions.list()) {
      const projectId = typeof recording.metadata?.projectId === "string" ? recording.metadata.projectId : null;
      const domainId = recording.environment.domainId;
      if (!projectId || !domainId || !legacyIds.has(projectId)) continue;
      const domains = domainsByProject.get(projectId) ?? new Set<string>();
      domains.add(domainId);
      domainsByProject.set(projectId, domains);
    }
    return new Map([...domainsByProject].flatMap(([projectId, domains]) => domains.size === 1 ? [[projectId, [...domains][0]!]] : []));
  }
}

export function flowPublicationId(flowId: string, version: string): string {
  return `${flowId}@${version}`;
}
