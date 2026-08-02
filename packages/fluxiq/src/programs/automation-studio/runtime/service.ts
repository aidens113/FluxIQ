import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import type { AutomationStudioSnapshot } from "../api";
import type { AutomationStudioProject, AutomationStudioProjectCategory, AutomationStudioProjectHierarchy } from "../api/contracts";
import {
  appendRecordingEntry,
  createAutomationStudioFixture,
  createBlankAutomationStudioFlow,
  createRecordingSession,
  diffStateSnapshots,
  finalizeRecordingSession,
  type AutomationStudioConfigArtifact,
  type AutomationStudioFlowDocument,
  type AutomationStudioProjectArtifacts,
  type AutomationStudioProjectArtifactKind,
  type AutomationStudioRoutineArtifact,
  type AutomationStudioRuntimeSession,
  type AutomationStudioTaskArtifact,
  type AppendRecordingEntryInput,
  type CreateRecordingSessionInput,
  type RecordingDomainDefinition,
  type RecordingDomainEventInput,
  type RecordingDomainEventProcessingResult,
  RecordingDomainRegistry,
  type RecordingSession,
  type SignalRegistry,
  type StateSnapshot,
  processRecordingDomainEvent
} from "../model";
import { normalizeRecordingTimeline, type NormalizationOptions, type NormalizedTimeline } from "../normalization";
import { automationNodeClasses } from "../nodes";
import { runAutomationStudioGraph } from "./executor";
import { ProgramJsonStore, programDataFile, safeSegment } from "../../_shared/storage";
import type { JsonObject } from "../../../core";
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

type AutomationStudioProjectIndex = {
  categories: AutomationStudioProjectCategory[];
  projects: AutomationStudioProject[];
};

type RecordingIndex = {
  recordings: { recordingId: string; taskId?: string; startedAt: number; endedAt?: number; updatedAt: number }[];
  normalizedTimelines: { normalizedTimelineId: string; recordingId: string; generatedAt: number }[];
};

type RuntimeIndex = {
  sessions: { runId: string; targetKind: AutomationStudioRuntimeSession["targetKind"]; targetId: string; status: AutomationStudioRuntimeSession["status"]; updatedAt: number }[];
};

export class AutomationStudioService {
  private readonly repositories: CanonicalAutomationStudioRepositories;
  private readonly projectIndexStore?: ProgramJsonStore<AutomationStudioProjectIndex>;
  private readonly legacyProjectStore?: ProgramJsonStore<{ categories: AutomationStudioProjectCategory[]; projects: AutomationStudioProjectRecord[] }>;
  private readonly projectRootDir?: string;
  private readonly nodeRootDir?: string;
  private readonly recordingDomains = new RecordingDomainRegistry();
  private readonly ready: Promise<void>;
  private storageReady?: Promise<void>;

  constructor(options: AutomationStudioServiceOptions = {}) {
    this.repositories = options.repositories ?? createCanonicalAutomationStudioMemoryRepositories();
    if (options.dataDir) {
      const automationDataDir = path.join(options.dataDir, "programs", "automation-studio");
      this.projectRootDir = path.join(automationDataDir, "projects");
      this.nodeRootDir = path.join(automationDataDir, "nodes");
      this.projectIndexStore = new ProgramJsonStore(path.join(this.projectRootDir, "index.json"), () => ({ categories: [], projects: [] }));
      this.legacyProjectStore = new ProgramJsonStore(programDataFile(options.dataDir, "automation-studio", "projects.json"), () => ({ categories: [], projects: [] }));
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

  async listRecordingSessions(projectId?: string | null): Promise<RecordingSession[]> {
    await this.ready;
    if (projectId) await this.loadProjectRecordings(projectId);
    return await this.repositories.recordingSessions.list();
  }

  async getRecordingSession(recordingId: string, projectId?: string | null): Promise<RecordingSession> {
    await this.ready;
    if (projectId) await this.loadProjectRecordings(projectId);
    const recording = await this.repositories.recordingSessions.get(recordingId);
    if (!recording) throw new Error(`Unknown Automation Studio recording: ${recordingId}`);
    return recording;
  }

  async createRecording(input: CreateRecordingSessionInput & { projectId?: string | null }): Promise<RecordingSession> {
    await this.ready;
    const recording = createRecordingSession(input);
    await this.repositories.recordingSessions.put(recording);
    if (input.projectId) await this.writeProjectRecordingSession(input.projectId, recording);
    return recording;
  }

  async appendRecordingEvent(input: { projectId?: string | null; recordingId: string; entry: AppendRecordingEntryInput }): Promise<RecordingSession> {
    const recording = await this.getRecordingSession(input.recordingId, input.projectId);
    const next = appendRecordingEntry(recording, input.entry);
    await this.repositories.recordingSessions.put(next);
    if (input.projectId) await this.writeProjectRecordingSession(input.projectId, next);
    return next;
  }

  async finalizeRecording(input: { projectId?: string | null; recordingId: string; endedAt?: number }): Promise<RecordingSession> {
    const recording = await this.getRecordingSession(input.recordingId, input.projectId);
    const finalized = finalizeRecordingSession(recording, input.endedAt);
    await this.repositories.recordingSessions.put(finalized);
    if (input.projectId) await this.writeProjectRecordingSession(input.projectId, finalized);
    return finalized;
  }

  async normalizeRecording(input: { projectId?: string | null; recordingId: string; options?: NormalizationOptions }): Promise<NormalizedTimeline> {
    const recording = await this.getRecordingSession(input.recordingId, input.projectId);
    const normalized = normalizeRecordingTimeline(recording, input.options);
    await this.repositories.normalizedTimelines.put(normalized);
    if (input.projectId) await this.writeProjectNormalizedTimeline(input.projectId, normalized);
    return normalized;
  }

  async inspectStateDiff(input: { previous: StateSnapshot; current: StateSnapshot; includeStable?: boolean }) {
    return { deltas: diffStateSnapshots(input.previous, input.current, input.includeStable !== undefined ? { includeStable: input.includeStable } : {}) };
  }

  async listSignalRegistries(): Promise<SignalRegistry[]> {
    await this.ready;
    return await this.repositories.signalRegistries.list();
  }

  registerRecordingDomain(definition: RecordingDomainDefinition): RecordingDomainDefinition {
    return this.recordingDomains.register(definition);
  }

  unregisterRecordingDomain(domainId: string): boolean {
    return this.recordingDomains.unregister(domainId);
  }

  listRecordingDomains(): RecordingDomainDefinition[] {
    return this.recordingDomains.list();
  }

  validateRecordingDomainEvent(input: RecordingDomainEventInput) {
    return this.recordingDomains.validate(input);
  }

  async appendRecordingDomainEvent(input: RecordingDomainEventInput): Promise<RecordingDomainEventProcessingResult> {
    const recording = await this.getRecordingSession(input.recordingId, input.projectId);
    const result = await processRecordingDomainEvent(this.recordingDomains, recording, input);
    if (result.accepted) {
      await this.repositories.recordingSessions.put(result.recording);
      if (input.projectId) await this.writeProjectRecordingSession(input.projectId, result.recording);
    }
    return result;
  }

  async listProjectArtifacts(projectId: string): Promise<AutomationStudioProjectArtifacts> {
    await this.findProject(projectId);
    return {
      tasks: await this.readProjectArtifactList<AutomationStudioTaskArtifact>(projectId, "tasks"),
      routines: await this.readProjectArtifactList<AutomationStudioRoutineArtifact>(projectId, "routines"),
      configs: await this.readProjectArtifactList<AutomationStudioConfigArtifact>(projectId, "configs"),
      flows: await this.readProjectArtifactList<AutomationStudioFlowDocument>(projectId, "flows")
    };
  }

  async saveProjectArtifact(input: { projectId: string; kind: AutomationStudioProjectArtifactKind; artifact: unknown }): Promise<unknown> {
    await this.findProject(input.projectId);
    if (!input.artifact || typeof input.artifact !== "object" || Array.isArray(input.artifact)) throw new Error("Artifact object is required.");
    const artifact = input.artifact as Record<string, unknown>;
    const id = this.projectArtifactId(input.kind, artifact);
    const now = Date.now();
    const withTimestamps = {
      ...artifact,
      schemaVersion: typeof artifact.schemaVersion === "string" ? artifact.schemaVersion : "0.1",
      createdAt: typeof artifact.createdAt === "number" ? artifact.createdAt : now,
      updatedAt: now
    } as unknown as JsonObject;
    await new ProgramJsonStore<JsonObject>(this.projectArtifactFile(input.projectId, input.kind, id), () => ({})).write(withTimestamps);
    return withTimestamps;
  }

  async getProjectArtifact(projectId: string, kind: AutomationStudioProjectArtifactKind, artifactId: string): Promise<unknown> {
    await this.findProject(projectId);
    const artifact = await new ProgramJsonStore<JsonObject>(this.projectArtifactFile(projectId, kind, artifactId), () => ({})).read();
    if (!Object.keys(artifact).length) throw new Error(`Unknown Automation Studio ${kind}: ${artifactId}`);
    return artifact;
  }

  async createDefaultFlow(input: { projectId: string; ownerKind: "task" | "routine"; ownerId: string; name: string; description?: string }): Promise<AutomationStudioFlowDocument> {
    const flow = createBlankAutomationStudioFlow({
      flowId: `${input.ownerKind}.${safeSegment(input.ownerId)}.flow`,
      ownerKind: input.ownerKind,
      ownerId: input.ownerId,
      name: input.name,
      ...(input.description ? { description: input.description } : {})
    });
    await this.saveProjectArtifact({ projectId: input.projectId, kind: "flow", artifact: flow });
    return flow;
  }

  async listProjectNormalizedTimelines(projectId: string): Promise<NormalizedTimeline[]> {
    await this.loadProjectRecordings(projectId);
    const index = await this.readRecordingIndex(projectId);
    const timelines: NormalizedTimeline[] = [];
    for (const item of index.normalizedTimelines ?? []) {
      const timeline = await this.repositories.normalizedTimelines.get(item.normalizedTimelineId);
      if (timeline) timelines.push(timeline);
    }
    return timelines;
  }

  async startRuntimeSession(input: {
    projectId?: string | null;
    targetKind?: AutomationStudioRuntimeSession["targetKind"];
    targetId?: string;
    flow?: AutomationStudioFlowDocument;
    flowId?: string;
    inputs?: JsonObject;
    metadata?: JsonObject;
  }): Promise<AutomationStudioRuntimeSession> {
    const flow = input.flow ?? (input.projectId && input.flowId ? await this.getProjectArtifact(input.projectId, "flow", input.flowId) as AutomationStudioFlowDocument : undefined);
    if (!flow) throw new Error("A flow document or project flow ID is required.");
    const now = Date.now();
    const session: AutomationStudioRuntimeSession = {
      schemaVersion: "0.1",
      runId: randomUUID(),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      targetKind: input.targetKind ?? (flow.ownerKind === "policy" ? "flow" : flow.ownerKind),
      targetId: input.targetId ?? flow.ownerId,
      flowId: flow.flowId,
      status: "queued",
      queuedAt: now,
      flow,
      metadata: { ...(input.metadata ?? {}), inputs: input.inputs ?? {} }
    };
    if (input.projectId) await this.writeRuntimeSession(input.projectId, session);
    return session;
  }

  async runRuntimeSession(input: {
    projectId?: string | null;
    runId?: string;
    flow?: AutomationStudioFlowDocument;
    flowId?: string;
    inputs?: JsonObject;
    maxSteps?: number;
  }): Promise<AutomationStudioRuntimeSession> {
    const existing = input.projectId && input.runId ? await this.getRuntimeSession(input.projectId, input.runId) : null;
    const startInput: Parameters<AutomationStudioService["startRuntimeSession"]>[0] = {};
    if (input.projectId !== undefined) startInput.projectId = input.projectId;
    if (input.flow !== undefined) startInput.flow = input.flow;
    if (input.flowId !== undefined) startInput.flowId = input.flowId;
    if (input.inputs !== undefined) startInput.inputs = input.inputs;
    const session = existing ?? await this.startRuntimeSession(startInput);
    const startedAt = Date.now();
    const graphOptions: Parameters<typeof runAutomationStudioGraph>[1] = {
      inputs: (input.inputs ?? session.metadata?.inputs ?? {}) as Record<string, any>
    };
    if (input.maxSteps !== undefined) graphOptions.maxSteps = input.maxSteps;
    const trace = await runAutomationStudioGraph(session.flow, graphOptions);
    const next: AutomationStudioRuntimeSession = {
      ...session,
      status: trace.status,
      startedAt: session.startedAt ?? startedAt,
      ...(trace.finishedAt !== undefined ? { finishedAt: trace.finishedAt } : {}),
      trace
    };
    if (input.projectId) await this.writeRuntimeSession(input.projectId, next);
    return next;
  }

  async getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null> {
    await this.findProject(projectId);
    const stored = await new ProgramJsonStore<JsonObject>(this.projectFile(projectId, "runtime", "sessions", `${safeSegment(runId)}.json`), () => ({})).read();
    return stored.session as unknown as AutomationStudioRuntimeSession | undefined ?? null;
  }

  async listRuntimeSessions(projectId: string): Promise<AutomationStudioRuntimeSession[]> {
    const index = await this.readRuntimeIndex(projectId);
    const sessions: AutomationStudioRuntimeSession[] = [];
    for (const item of index.sessions ?? []) {
      const session = await this.getRuntimeSession(projectId, item.runId);
      if (session) sessions.push(session);
    }
    return sessions.sort((left, right) => (right.startedAt ?? right.queuedAt) - (left.startedAt ?? left.queuedAt));
  }

  async listProjects(): Promise<{ categories: AutomationStudioProjectCategory[]; projects: AutomationStudioProject[] }> {
    const state = await this.readProjectIndex();
    return {
      categories: this.sortCategories(state.categories ?? []),
      projects: state.projects
        .sort((left, right) => right.updatedAt - left.updatedAt)
    };
  }

  async createProject(input: { name?: unknown; description?: unknown; categoryId?: unknown }): Promise<AutomationStudioProject> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Project name is required.");
    const now = Date.now();
    const categoryId = typeof input.categoryId === "string" && input.categoryId.trim() ? input.categoryId.trim() : null;
    const project: AutomationStudioProject = {
      id: randomUUID(),
      name,
      description: typeof input.description === "string" ? input.description.trim() : "",
      categoryId,
      createdAt: now,
      updatedAt: now
    };
    await this.writeProjectIndex((state) => ({ ...state, projects: [project, ...state.projects] }));
    await this.writeProjectRecord({ ...project, customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} });
    return project;
  }

  async updateProject(input: { projectId?: unknown; name?: unknown; description?: unknown; categoryId?: unknown }): Promise<AutomationStudioProject> {
    const projectId = String(input.projectId ?? "");
    const name = typeof input.name === "string" ? input.name.trim() : undefined;
    if (name !== undefined && !name) throw new Error("Project name is required.");
    let updated: AutomationStudioProject | undefined;
    await this.writeProjectIndex((state) => ({
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
    const existing = await this.findProject(projectId);
    await this.writeProjectRecord({ ...existing, ...updated });
    return updated;
  }

  async deleteProject(projectId: string): Promise<{ deletedProjectId: string }> {
    await this.findProject(projectId);
    await this.writeProjectIndex((state) => ({
      ...state,
      projects: state.projects.filter((project) => project.id !== projectId)
    }));
    if (this.projectRootDir) await rm(this.projectDirectory(projectId), { recursive: true, force: true });
    return { deletedProjectId: projectId };
  }

  async createProjectCategory(input: { name?: unknown }): Promise<AutomationStudioProjectCategory> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Category name is required.");
    const now = Date.now();
    const state = await this.readProjectIndex();
    const category = { id: randomUUID(), name, order: nextCategoryOrder(state.categories), createdAt: now, updatedAt: now };
    await this.writeProjectIndex((state) => ({ ...state, categories: [category, ...(state.categories ?? [])] }));
    return category;
  }

  async updateProjectCategory(input: { categoryId?: unknown; name?: unknown }): Promise<AutomationStudioProjectCategory> {
    const categoryId = String(input.categoryId ?? "");
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Category name is required.");
    let updated: AutomationStudioProjectCategory | undefined;
    await this.writeProjectIndex((state) => ({
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
    const affectedProjects: AutomationStudioProject[] = [];
    await this.writeProjectIndex((state) => ({
      ...state,
      categories: (state.categories ?? []).filter((category) => category.id !== categoryId),
      projects: state.projects.map((project) => {
        if (project.categoryId !== categoryId) return project;
        const updated = { ...project, categoryId: null, updatedAt: Date.now() };
        affectedProjects.push(updated);
        return updated;
      })
    }));
    for (const project of affectedProjects) {
      const existing = await this.findProject(project.id);
      await this.writeProjectRecord({ ...existing, ...project });
    }
    return { deletedCategoryId: categoryId };
  }

  async reorderProjectCategories(categoryIds: string[]): Promise<{ categories: AutomationStudioProjectCategory[] }> {
    const requestedIds = categoryIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim());
    let categories: AutomationStudioProjectCategory[] = [];
    await this.writeProjectIndex((state) => {
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
    let updatedProject: AutomationStudioProject | undefined;
    await this.writeProjectIndex((state) => ({
      ...state,
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        updatedProject = { ...project, updatedAt: Date.now() };
        return updatedProject;
      })
    }));
    if (!updatedProject) throw new Error(`Unknown Automation Studio project: ${projectId}`);
    await this.writeProjectRecord({ ...updatedProject, ...nextHierarchy });
    return nextHierarchy;
  }

  private async readProjectIndex(): Promise<AutomationStudioProjectIndex> {
    await this.ensureStorageReady();
    const state = this.projectIndexStore ? await this.projectIndexStore.read() : { categories: [], projects: [] };
    return { categories: normalizeProjectCategories(state.categories ?? []), projects: state.projects ?? [] };
  }

  private async writeProjectIndex(mutator: (state: AutomationStudioProjectIndex) => AutomationStudioProjectIndex): Promise<AutomationStudioProjectIndex> {
    await this.ensureStorageReady();
    if (!this.projectIndexStore) return mutator({ categories: [], projects: [] });
    return await this.projectIndexStore.update((state) => mutator({ categories: normalizeProjectCategories(state.categories ?? []), projects: state.projects ?? [] }));
  }

  private sortCategories(categories: AutomationStudioProjectCategory[]): AutomationStudioProjectCategory[] {
    return [...normalizeProjectCategories(categories)].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  }

  private async findProject(projectId: string): Promise<AutomationStudioProjectRecord> {
    const state = await this.readProjectIndex();
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) throw new Error(`Unknown Automation Studio project: ${projectId}`);
    return await this.readProjectRecord(project);
  }

  private async readProjectRecord(project: AutomationStudioProject): Promise<AutomationStudioProjectRecord> {
    if (!this.projectRootDir) return { ...project, customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} };
    await this.ensureProjectStructure(project.id);
    const legacyHierarchy = await new ProgramJsonStore<AutomationStudioProjectHierarchy>(this.projectFile(project.id, "hierarchy", "index.json"), () => ({ customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} })).read();
    const nodes = await new ProgramJsonStore<{ customHierarchyNodes: AutomationStudioProjectHierarchy["customHierarchyNodes"] }>(this.projectFile(project.id, "hierarchy", "nodes.json"), () => ({ customHierarchyNodes: legacyHierarchy.customHierarchyNodes ?? [] })).read();
    const deleted = await new ProgramJsonStore<{ deletedHierarchyIds: string[] }>(this.projectFile(project.id, "hierarchy", "deleted.json"), () => ({ deletedHierarchyIds: legacyHierarchy.deletedHierarchyIds ?? [] })).read();
    const workspace = await new ProgramJsonStore<{ workspacePrefs: AutomationStudioProjectHierarchy["workspacePrefs"] }>(this.projectFile(project.id, "workspace", "preferences.json"), () => ({ workspacePrefs: legacyHierarchy.workspacePrefs ?? {} })).read();
    return {
      ...project,
      customHierarchyNodes: Array.isArray(nodes.customHierarchyNodes) ? nodes.customHierarchyNodes : [],
      deletedHierarchyIds: Array.isArray(deleted.deletedHierarchyIds) ? deleted.deletedHierarchyIds : [],
      workspacePrefs: workspace.workspacePrefs && typeof workspace.workspacePrefs === "object" && !Array.isArray(workspace.workspacePrefs) ? workspace.workspacePrefs : {}
    };
  }

  private async writeProjectRecord(project: AutomationStudioProjectRecord): Promise<void> {
    if (!this.projectRootDir) return;
    await this.ensureProjectStructure(project.id);
    const { customHierarchyNodes, deletedHierarchyIds, workspacePrefs, ...manifest } = project;
    await new ProgramJsonStore(this.projectFile(project.id, "manifest.json"), () => ({})).write(manifest);
    await new ProgramJsonStore<{ customHierarchyNodes: AutomationStudioProjectHierarchy["customHierarchyNodes"] }>(this.projectFile(project.id, "hierarchy", "nodes.json"), () => ({ customHierarchyNodes: [] })).write({ customHierarchyNodes });
    await new ProgramJsonStore<{ deletedHierarchyIds: string[] }>(this.projectFile(project.id, "hierarchy", "deleted.json"), () => ({ deletedHierarchyIds: [] })).write({ deletedHierarchyIds });
    await new ProgramJsonStore<{ workspacePrefs: AutomationStudioProjectHierarchy["workspacePrefs"] }>(this.projectFile(project.id, "workspace", "preferences.json"), () => ({ workspacePrefs: {} })).write({ workspacePrefs });
  }

  private async migrateLegacyProjectStore(): Promise<void> {
    if (!this.projectIndexStore || !this.legacyProjectStore) return;
    const index = await this.projectIndexStore.read();
    if (index.projects.length > 0 || index.categories.length > 0) return;
    const legacy = await this.legacyProjectStore.read();
    if (!legacy.projects.length && !legacy.categories.length) return;
    await this.projectIndexStore.write({
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
    if (!this.nodeRootDir) return;
    await Promise.all([
      mkdir(path.join(this.nodeRootDir, "custom"), { recursive: true }),
      mkdir(path.join(this.nodeRootDir, "packages"), { recursive: true }),
      ...automationNodeClasses.map((nodeClass) => mkdir(path.join(this.nodeRootDir!, "custom", nodeClass), { recursive: true }))
    ]);
  }

  private async ensureProjectStructure(projectId: string): Promise<void> {
    if (!this.projectRootDir) return;
    const root = this.projectDirectory(projectId);
    await Promise.all([
      mkdir(root, { recursive: true }),
      mkdir(path.join(root, "hierarchy"), { recursive: true }),
      mkdir(path.join(root, "workspace"), { recursive: true }),
      mkdir(path.join(root, "tasks"), { recursive: true }),
      mkdir(path.join(root, "routines"), { recursive: true }),
      mkdir(path.join(root, "configs"), { recursive: true }),
      mkdir(path.join(root, "flows"), { recursive: true }),
      mkdir(path.join(root, "recordings"), { recursive: true }),
      mkdir(path.join(root, "recordings", "sessions"), { recursive: true }),
      mkdir(path.join(root, "recordings", "normalized"), { recursive: true }),
      mkdir(path.join(root, "recordings", "snapshots"), { recursive: true }),
      mkdir(path.join(root, "recordings", "indexes"), { recursive: true }),
      mkdir(path.join(root, "policies"), { recursive: true }),
      mkdir(path.join(root, "runtime"), { recursive: true }),
      mkdir(path.join(root, "runtime", "sessions"), { recursive: true }),
      mkdir(path.join(root, "runtime", "indexes"), { recursive: true }),
      mkdir(path.join(root, "state"), { recursive: true }),
      mkdir(path.join(root, "custom-nodes"), { recursive: true }),
      mkdir(path.join(root, "artifacts"), { recursive: true })
    ]);
  }

  private projectDirectory(projectId: string): string {
    if (!this.projectRootDir) return "";
    return path.join(this.projectRootDir, safeSegment(projectId));
  }

  private projectFile(projectId: string, ...parts: string[]): string {
    return path.join(this.projectDirectory(projectId), ...parts);
  }

  private async readRecordingIndex(projectId: string): Promise<RecordingIndex> {
    await this.findProject(projectId);
    return await new ProgramJsonStore<RecordingIndex>(this.projectFile(projectId, "recordings", "indexes", "recordings.json"), () => ({ recordings: [], normalizedTimelines: [] })).read();
  }

  private async readRuntimeIndex(projectId: string): Promise<RuntimeIndex> {
    await this.findProject(projectId);
    return await new ProgramJsonStore<RuntimeIndex>(this.projectFile(projectId, "runtime", "indexes", "sessions.json"), () => ({ sessions: [] })).read();
  }

  private async writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<void> {
    await this.ensureProjectStructure(projectId);
    await new ProgramJsonStore<JsonObject>(this.projectFile(projectId, "runtime", "sessions", `${safeSegment(session.runId)}.json`), () => ({})).write({ session: session as unknown as JsonObject });
    await new ProgramJsonStore<RuntimeIndex>(this.projectFile(projectId, "runtime", "indexes", "sessions.json"), () => ({ sessions: [] })).update((index) => ({
      sessions: upsertBy(index.sessions ?? [], "runId", {
        runId: session.runId,
        targetKind: session.targetKind,
        targetId: session.targetId,
        status: session.status,
        updatedAt: Date.now()
      })
    }));
  }

  private async readProjectArtifactList<TArtifact>(projectId: string, folder: "tasks" | "routines" | "configs" | "flows"): Promise<TArtifact[]> {
    await this.ensureProjectStructure(projectId);
    if (!this.projectRootDir) return [];
    const dir = path.join(this.projectDirectory(projectId), folder);
    let files: string[] = [];
    try {
      files = await readdir(dir);
    } catch {
      return [];
    }
    const artifacts: TArtifact[] = [];
    for (const file of files.filter((item) => item.endsWith(".json"))) {
      const data = await new ProgramJsonStore<JsonObject>(path.join(dir, file), () => ({})).read();
      if (Object.keys(data).length) artifacts.push(data as unknown as TArtifact);
    }
    return artifacts;
  }

  private projectArtifactFile(projectId: string, kind: AutomationStudioProjectArtifactKind, artifactId: string): string {
    return this.projectFile(projectId, this.projectArtifactFolder(kind), `${safeSegment(artifactId)}.json`);
  }

  private projectArtifactFolder(kind: AutomationStudioProjectArtifactKind): "tasks" | "routines" | "configs" | "flows" {
    if (kind === "task") return "tasks";
    if (kind === "routine") return "routines";
    if (kind === "config") return "configs";
    return "flows";
  }

  private projectArtifactId(kind: AutomationStudioProjectArtifactKind, artifact: Record<string, unknown>): string {
    const id = kind === "task" ? artifact.taskId : kind === "routine" ? artifact.routineId : kind === "config" ? artifact.configId : artifact.flowId;
    if (typeof id !== "string" || !id.trim()) throw new Error(`${kind} ID is required.`);
    return id;
  }

  private async writeRecordingIndex(projectId: string, mutator: (index: RecordingIndex) => RecordingIndex): Promise<RecordingIndex> {
    await this.findProject(projectId);
    return await new ProgramJsonStore<RecordingIndex>(this.projectFile(projectId, "recordings", "indexes", "recordings.json"), () => ({ recordings: [], normalizedTimelines: [] })).update(mutator);
  }

  private async writeProjectRecordingSession(projectId: string, recording: RecordingSession): Promise<void> {
    await this.ensureProjectStructure(projectId);
    const recordingId = safeSegment(recording.recordingId);
    const sessionDir = path.join(this.projectDirectory(projectId), "recordings", "sessions", recordingId);
    await mkdir(path.join(sessionDir, "events"), { recursive: true });
    await mkdir(path.join(sessionDir, "snapshots"), { recursive: true });
    await new ProgramJsonStore<JsonObject>(path.join(sessionDir, "recording.json"), () => ({ recording: recording as unknown as JsonObject })).write({ recording: recording as unknown as JsonObject });
    await new ProgramJsonStore<JsonObject>(path.join(sessionDir, "events", "timeline.json"), () => ({ timeline: [] })).write({ timeline: recording.timeline as unknown as JsonObject[] });
    await new ProgramJsonStore<JsonObject>(path.join(sessionDir, "snapshots", "initial-state.json"), () => ({ initialState: recording.initialState as unknown as JsonObject })).write({ initialState: recording.initialState as unknown as JsonObject });
    await this.writeRecordingIndex(projectId, (index) => ({
      recordings: upsertBy(index.recordings ?? [], "recordingId", {
        recordingId: recording.recordingId,
        ...(recording.taskId !== undefined ? { taskId: recording.taskId } : {}),
        startedAt: recording.startedAt,
        ...(recording.endedAt !== undefined ? { endedAt: recording.endedAt } : {}),
        updatedAt: Date.now()
      }),
      normalizedTimelines: index.normalizedTimelines ?? []
    }));
  }

  private async writeProjectNormalizedTimeline(projectId: string, normalized: NormalizedTimeline): Promise<void> {
    await this.ensureProjectStructure(projectId);
    const fileName = `${safeSegment(normalized.normalizedTimelineId)}.json`;
    await new ProgramJsonStore<JsonObject>(this.projectFile(projectId, "recordings", "normalized", fileName), () => ({ normalizedTimeline: normalized as unknown as JsonObject })).write({ normalizedTimeline: normalized as unknown as JsonObject });
    await this.writeRecordingIndex(projectId, (index) => ({
      recordings: index.recordings ?? [],
      normalizedTimelines: upsertBy(index.normalizedTimelines ?? [], "normalizedTimelineId", {
        normalizedTimelineId: normalized.normalizedTimelineId,
        recordingId: normalized.recordingId,
        generatedAt: normalized.generatedAt
      })
    }));
  }

  private async loadProjectRecordings(projectId: string): Promise<void> {
    if (!this.projectRootDir) return;
    const index = await this.readRecordingIndex(projectId);
    for (const item of index.recordings ?? []) {
      const stored = await new ProgramJsonStore<JsonObject>(
        this.projectFile(projectId, "recordings", "sessions", safeSegment(item.recordingId), "recording.json"),
        () => ({})
      ).read();
      const recording = stored.recording as unknown as RecordingSession | undefined;
      if (recording?.recordingId) await this.repositories.recordingSessions.put(recording);
    }
    for (const item of index.normalizedTimelines ?? []) {
      const stored = await new ProgramJsonStore<JsonObject>(
        this.projectFile(projectId, "recordings", "normalized", `${safeSegment(item.normalizedTimelineId)}.json`),
        () => ({})
      ).read();
      const normalized = stored.normalizedTimeline as unknown as NormalizedTimeline | undefined;
      if (normalized?.normalizedTimelineId) await this.repositories.normalizedTimelines.put(normalized);
    }
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

function upsertBy<TItem, TKey extends keyof TItem>(items: TItem[], key: TKey, item: TItem): TItem[] {
  const index = items.findIndex((candidate) => candidate[key] === item[key]);
  if (index < 0) return [item, ...items];
  return items.map((candidate, candidateIndex) => candidateIndex === index ? item : candidate);
}
