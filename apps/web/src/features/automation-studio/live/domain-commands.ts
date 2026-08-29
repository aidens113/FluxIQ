import type { AutomationStudioFlowDocument, StateSnapshot } from "fluxiq/automation-studio";
import { applyAutomationGraphOperationBatch } from "../graph/operation-history";
import {
  loadAutomationGraphOperationDraft,
  type AutomationGraphDraftRecord
} from "../graph/draft-store";
import {
  createBrowserAutomationFlowDraftRepository,
  deprecateAutomationFlow,
  discardAutomationFlowDraft,
  loadAutomationFlowDetail,
  loadAutomationNodeDefinitions,
  persistAutomationFlowDraft,
  publishAutomationFlow,
  resolveAutomationSubflowEditor,
  restoreAutomationFlowDraft,
  runCurrentAutomationFlow,
  saveAutomationFlowDraft,
  updateAutomationFlowDraft,
  type AutomationEditableFlowGraph,
  type AutomationFlowCommandOutcome,
  type AutomationFlowReadCache,
  type RunnableAutomationFlow
} from "../flow-editor/commands";
import type { AutomationRecordingCleanupTransaction } from "../recordings/commands";
import type {
  AutomationStatePublication,
  AutomationStateViewRequest
} from "../state/commands";
import type { AutomationProjectApi } from "../project/project-api";
import type { AutomationProjectDataPlatform } from "../sync/useAutomationProjectDataPlatform";
import type { JsonObject } from "../../programs/program-api";
import type { AutomationLiveCommandScopeController } from "./command-scope";
import { AutomationLiveRecordingCommands } from "./recording-domain-commands";
import { AutomationLiveStateCommands } from "./state-domain-commands";

type Graph = AutomationEditableFlowGraph;
type CommandSignal = { signal?: AbortSignal };

function flowFailure<T>(message: string): AutomationFlowCommandOutcome<T> {
  return { status: "failure", code: "PROJECT_REQUIRED", error: message };
}

class LiveFlowReadCache implements AutomationFlowReadCache {
  private values = new Map<string, unknown>();

  get<T>(scope: "flow" | "node-definitions" | "subflow", projectId: string, resourceId: string): T | null {
    return this.values.get([projectId, scope, resourceId].join("::")) as T | undefined ?? null;
  }

  set<T>(scope: "flow" | "node-definitions" | "subflow", projectId: string, resourceId: string, value: T): T {
    this.values.set([projectId, scope, resourceId].join("::"), value);
    return value;
  }

  clearProject(projectId: string): void {
    const prefix = projectId + "::";
    for (const key of this.values.keys()) {
      if (key.startsWith(prefix)) this.values.delete(key);
    }
  }
}

export class AutomationLiveDomainCommands {
  private readonly drafts = createBrowserAutomationFlowDraftRepository();
  private readonly flowCache = new LiveFlowReadCache();
  private readonly recordings: AutomationLiveRecordingCommands;
  private readonly state: AutomationLiveStateCommands;
  private activeCacheProjectId: string | null = null;

  constructor(
    private readonly api: AutomationProjectApi,
    private readonly data: AutomationProjectDataPlatform,
    private readonly scopes: AutomationLiveCommandScopeController
  ) {
    this.recordings = new AutomationLiveRecordingCommands(api, data, scopes);
    this.state = new AutomationLiveStateCommands(api, scopes);
  }

  syncProject(): void {
    const projectId = this.scopes.current()?.projectId ?? null;
    if (this.activeCacheProjectId === projectId) return;
    if (this.activeCacheProjectId) this.flowCache.clearProject(this.activeCacheProjectId);
    this.state.abort();
    this.activeCacheProjectId = projectId;
  }

  loadFlowDetail<TFlow>(flowId: string, options: CommandSignal = {}) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(flowFailure<{ flow: TFlow; source: "cache" | "network" }>("Open a project before loading a Flow."));
    return loadAutomationFlowDetail<TFlow>({ scope, flowId, signal: options.signal ?? this.scopes.signal() }, {
      api: this.api,
      cache: this.flowCache,
      isCurrent: (candidate) => this.scopes.isCurrent(candidate)
    });
  }

  loadNodeDefinitions<TNode>(options: CommandSignal = {}) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(flowFailure<{ native: TNode[]; published: TNode[]; source: "cache" | "network" }>("Open a project before loading node definitions."));
    return loadAutomationNodeDefinitions<TNode>({ scope, signal: options.signal ?? this.scopes.signal() }, {
      api: this.api,
      cache: this.flowCache,
      isCurrent: (candidate) => this.scopes.isCurrent(candidate)
    });
  }

  resolveSubflowEditor(parentFlowId: string, subflowId: string, knownGraphFlowId?: string, options: CommandSignal = {}) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(flowFailure<{ graphFlowId: string; source: "known" | "cache" | "network" }>("Open a project before resolving a Subflow."));
    return resolveAutomationSubflowEditor({
      scope,
      parentFlowId,
      subflowId,
      ...(knownGraphFlowId ? { knownGraphFlowId } : {}),
      signal: options.signal ?? this.scopes.signal()
    }, {
      api: this.api,
      cache: this.flowCache,
      isCurrent: (candidate) => this.scopes.isCurrent(candidate)
    });
  }

  runFlow<TSession>(input: {
    flow: RunnableAutomationFlow | null;
    hasUnsavedChanges: boolean;
    allowSavedVersionWhenDirty: boolean;
    allowRequestedDomains: boolean;
  }) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(flowFailure<{ session: TSession; requestedDomainIds: string[] }>("Open a project before running a Flow."));
    return runCurrentAutomationFlow<TSession>({ scope, ...input, signal: this.scopes.signal() }, {
      api: this.api,
      isCurrent: (candidate) => this.scopes.isCurrent(candidate)
    });
  }

  restoreFlowDraft(draftKey: string | null, draft: AutomationGraphDraftRecord<Graph> | null) {
    const scope = this.scopes.current();
    if (!scope) return flowFailure<{ draftKey: string; graph: Graph; savedAt: number }>("Open a project before restoring a Flow draft.");
    return restoreAutomationFlowDraft({ scope, draftKey, draft, signal: this.scopes.signal() }, {
      isCurrent: (candidate) => this.scopes.isCurrent(candidate)
    });
  }

  async loadRecoverableFlowDraft(flowId: string, baseGraph: Graph | null): Promise<AutomationGraphDraftRecord<Graph> | null> {
    const scope = this.scopes.current();
    if (!scope) return null;
    const snapshot = this.drafts.loadSnapshot<Graph>(scope.projectId, flowId);
    if (snapshot) return this.scopes.isCurrent(scope) ? snapshot : null;
    const operations = await loadAutomationGraphOperationDraft(scope.projectId, flowId);
    if (!operations || !baseGraph || !this.scopes.isCurrent(scope)) return null;
    const graph = applyAutomationGraphOperationBatch(baseGraph as any, {
      batchId: "browser-draft",
      baseRevision: operations.baseRevision,
      createdAt: operations.savedAt,
      operations: operations.operations as any,
      estimatedBytes: operations.estimatedBytes
    }, "forward");
    return {
      projectId: operations.projectId,
      flowId: operations.flowId,
      baseUpdatedAt: operations.baseUpdatedAt,
      savedAt: operations.savedAt,
      graph
    };
  }

  persistFlowDraft(flowId: string, baseUpdatedAt: number, graph: Graph, savedAt = Date.now()) {
    const scope = this.scopes.current();
    if (!scope) return flowFailure<{ savedAt: number }>("Open a project before preserving a Flow draft.");
    return persistAutomationFlowDraft({ scope, flowId, baseUpdatedAt, graph, savedAt, signal: this.scopes.signal() }, {
      drafts: this.drafts,
      isCurrent: (candidate) => this.scopes.isCurrent(candidate)
    });
  }

  updateFlowDraft(input: {
    flowId: string;
    graph: Graph | null;
    baseGraph: Graph | null;
    baseRevision: string;
    baseUpdatedAt: number;
    savedAt?: number;
  }) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(flowFailure<{ graph: Graph | null; persisted: boolean; operationCount: number }>("Open a project before updating a Flow draft."));
    return updateAutomationFlowDraft({ scope, ...input, signal: this.scopes.signal() }, {
      drafts: this.drafts,
      isCurrent: (candidate) => this.scopes.isCurrent(candidate)
    });
  }

  discardFlowDraft(flowId: string) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(flowFailure<{ flowId: string }>("Open a project before discarding a Flow draft."));
    return discardAutomationFlowDraft({ scope, flowId, signal: this.scopes.signal() }, {
      drafts: this.drafts,
      isCurrent: (candidate) => this.scopes.isCurrent(candidate)
    });
  }

  saveFlowDraft(flow: AutomationStudioFlowDocument, graph: Graph, authorizationPin: string, canonical: boolean) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(flowFailure<{ flow: AutomationStudioFlowDocument; flowId: string }>("Open a project before saving a Flow."));
    return saveAutomationFlowDraft({ scope, flow, graph, authorizationPin, canonical, signal: this.scopes.signal() }, {
      api: this.api,
      drafts: this.drafts,
      isCurrent: (candidate) => this.scopes.isCurrent(candidate)
    });
  }

  publishFlow<TPublication>(flowId: string, version: string, changelog: string, publishedBy: string, authorizationPin: string) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(flowFailure<{ publication: TPublication | null; flowId: string; version: string }>("Open a project before publishing a Flow."));
    return publishAutomationFlow<TPublication>({ scope, flowId, version, changelog, publishedBy, authorizationPin, signal: this.scopes.signal() }, {
      api: this.api,
      isCurrent: (candidate) => this.scopes.isCurrent(candidate)
    });
  }

  deprecateFlow<TPublication>(flowId: string, version: string, reason: string, authorizationPin: string) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(flowFailure<{ publication: TPublication | null; flowId: string; version: string }>("Open a project before deprecating a Flow."));
    return deprecateAutomationFlow<TPublication>({ scope, flowId, version, reason, authorizationPin, signal: this.scopes.signal() }, {
      api: this.api,
      isCurrent: (candidate) => this.scopes.isCurrent(candidate)
    });
  }

  createRecording<TRecording>(input: {
    recordingId: string;
    taskId: string;
    authorizationPin: string;
    environment: JsonObject;
    initialState: JsonObject;
    metadata?: JsonObject;
  }) {
    return this.recordings.create<TRecording>(input);
  }

  finalizeRecording<TRecording>(recordingId: string, authorizationPin: string) {
    return this.recordings.finalize<TRecording>(recordingId, authorizationPin);
  }

  normalizeRecording<TTimeline, TReview = unknown>(recordingId: string) {
    return this.recordings.normalize<TTimeline, TReview>(recordingId);
  }

  updateRecording<TRecording>(recordingId: string, changes: JsonObject, authorizationPin: string) {
    return this.recordings.update<TRecording>(recordingId, changes, authorizationPin);
  }

  deleteRecording(recordingId: string, authorizationPin: string, transaction: AutomationRecordingCleanupTransaction) {
    return this.recordings.delete(recordingId, authorizationPin, transaction);
  }

  deleteRecordings(recordingIds: readonly string[], authorizationPin: string, transaction: AutomationRecordingCleanupTransaction) {
    return this.recordings.deleteMany(recordingIds, authorizationPin, transaction);
  }

  addRecordingNote<TRecording>(recordingId: string, text: string, authorizationPin: string, linkedEntryId?: string) {
    return this.recordings.addNote<TRecording>(recordingId, text, authorizationPin, linkedEntryId);
  }

  addRecordingMarker<TRecording>(recordingId: string, label: string, authorizationPin: string, linkedEntryId?: string, monotonicOffsetMs?: number) {
    return this.recordings.addMarker<TRecording>(recordingId, label, authorizationPin, linkedEntryId, monotonicOffsetMs);
  }

  openState<TState extends StateSnapshot = StateSnapshot>(
    request: AutomationStateViewRequest,
    publish: (event: AutomationStatePublication<TState>) => void
  ) {
    return this.state.open(request, publish);
  }

  loadRecordingDetail<TRecording>(recordingId: string) {
    return this.recordings.loadDetail<TRecording>(recordingId);
  }

  loadLatestNormalizedTimeline<TTimeline extends { normalizedTimelineId?: string; recordingId?: string; generatedAt?: number }>(recordingId: string) {
    return this.recordings.loadLatestTimeline<TTimeline>(recordingId);
  }

  async loadFlowMetadata(flowId: string): Promise<{ publications: any[]; dependencies: any }> {
    const scope = this.scopes.current();
    const empty = { publications: [], dependencies: { dependencies: [], usedBy: [], availableUpgrades: [] } };
    if (!scope) return empty;
    const value = await this.data.readThrough({
      scope: "flow-metadata",
      projectId: scope.projectId,
      resourceId: flowId,
      maxAgeMs: 30_000,
      load: async (signal) => {
        const [publications, dependencies] = await Promise.all([
          this.api.post<any>("list-flow-publications", { projectId: scope.projectId, flowId }, { signal }),
          this.api.post<any>("inspect-flow-dependencies", { projectId: scope.projectId, flowId }, { signal })
        ]);
        return {
          publications: publications.ok ? publications.payload?.publications ?? [] : [],
          dependencies: dependencies.ok ? dependencies.payload ?? empty.dependencies : empty.dependencies
        };
      }
    });
    return this.scopes.isCurrent(scope) ? value ?? empty : empty;
  }

  createFlowSubflow(payload: JsonObject) {
    return this.postProject<{ subflow?: any }>("create-flow-subflow", payload);
  }

  saveFlowDocument(payload: JsonObject) {
    return this.postProject<{ flow?: any }>("save-flow", payload);
  }

  getFlowDocument(flowId: string) {
    return this.postProject<{ flow?: any }>("get-flow", { flowId });
  }

  createFlowDocument(payload: JsonObject) {
    return this.postProject<{ flow?: any }>("create-flow", payload);
  }

  deleteFlowSubflow(payload: JsonObject) {
    return this.postProject("delete-flow-subflow", payload);
  }

  deleteFlowDocument(flowId: string, authorizationPin: string) {
    return this.postProject("delete-flow", { flowId, authorizationPin });
  }

  deleteProjectArtifact(payload: JsonObject) {
    return this.postProject<{ deleted?: boolean }>("delete-project-artifact", payload);
  }

  private async postProject<T = unknown>(endpoint: string, payload: JsonObject) {
    const scope = this.scopes.current();
    if (!scope) return { ok: false, error: "Open a project before changing Flow data." } as const;
    const response = await this.api.post<T>(endpoint, { projectId: scope.projectId, ...payload }, { signal: this.scopes.signal() });
    if (!this.scopes.isCurrent(scope)) return { ok: false, aborted: true, error: "The active project changed." } as const;
    return response;
  }
}
