import type {
  EvidenceAnchor,
  EvidenceReference,
  NodeEvidenceBinding,
  NodeEvidenceRole,
  NodeStatePhase,
  NodeStateRuntimeComparison,
  NodeStateSource,
  StateFact,
  StateSnapshot,
  StateValue,
  StateVisualFrame
} from "fluxiq/automation-studio";
import type { AutomationSelection } from "../types";

export type BuildNodeStateViewModelInput = {
  selection: AutomationSelection | null;
  selectedNode: unknown;
  selectedRecording: unknown;
  selectedTimeline: unknown;
  policy: unknown;
  taskGraph: unknown;
  pipelineArtifacts: unknown;
  recordings: unknown[];
  timelines: unknown[];
  runtimeSessions: unknown[];
  signals: unknown[];
  viewState?: {
    sourceId?: string;
    phase?: NodeStatePhase;
    selectedEvidenceId?: string;
    selectedFactPath?: string;
  };
};

export type StateFactViewModel = {
  id: string;
  namespace: string;
  path: string;
  fullPath: string;
  label: string;
  value: string;
  rawValue: unknown;
  observedAt?: number;
  confidence?: number;
  anchor?: EvidenceAnchor;
  source?: string;
};

export type NodeEvidenceBindingViewModel = {
  id: string;
  nodeId: string;
  factPath: string;
  role: NodeEvidenceRole;
  label: string;
  comparator: string;
  expectedValue?: string;
  weight?: number;
  confidence?: number;
  anchor?: EvidenceAnchor;
  provenanceCount: number;
  selected: boolean;
};

export type StateOverlayTone = "positive" | "weak" | "negative" | "mismatch" | "neutral";
export type StateVisualTone = "control" | "link" | "input" | "text" | "region" | "media" | "navigation" | "list" | "status" | "selected" | "disabled" | "unknown";

export type StateOverlayViewModel = {
  id: string;
  label: string;
  role: NodeEvidenceRole;
  tone: StateOverlayTone;
  anchor: EvidenceAnchor;
  factPath?: string;
  evidenceId?: string;
  confidence?: number;
  selected?: boolean;
  visualTone?: StateVisualTone;
};

export type StateStructuredRow = {
  id: string;
  namespace: string;
  path: string;
  label: string;
  value: string;
  type?: string;
  confidence?: string;
  source?: string;
};

export type StateDiffRow = {
  id: string;
  path: string;
  change: string;
  before: string;
  after: string;
  confidence?: string;
};

export type NodeStateRuntimeComparisonRow = {
  id: string;
  status: "match" | "mismatch" | "irrelevant";
  evidenceId?: string;
  factPath: string;
  label: string;
  expected: string;
  actual: string;
  score?: number;
  severity?: "warning" | "error";
  anchor?: EvidenceAnchor;
};

export type NodeStateRuntimeComparisonViewModel = {
  expectedSourceId: string;
  actualSourceId: string;
  nodeId: string;
  confidence?: number;
  matches: NodeStateRuntimeComparisonRow[];
  mismatches: NodeStateRuntimeComparisonRow[];
  irrelevant: NodeStateRuntimeComparisonRow[];
  rows: NodeStateRuntimeComparisonRow[];
};

export type NodeStateViewModel = {
  title: string;
  subtitle: string;
  sources: NodeStateSource[];
  activeSource: NodeStateSource | null;
  phases: Array<{ id: NodeStatePhase; label: string; available: boolean }>;
  activePhase: NodeStatePhase;
  visualFrame?: StateVisualFrame;
  facts: StateFactViewModel[];
  evidence: NodeEvidenceBindingViewModel[];
  overlays: StateOverlayViewModel[];
  structuredRows: StateStructuredRow[];
  diffRows: StateDiffRow[];
  runtimeComparison?: NodeStateRuntimeComparisonViewModel;
  raw: unknown;
  summary: {
    facts: number;
    evidence: number;
    strong: number;
    weak: number;
    negative: number;
    ignored: number;
    matches?: number;
    mismatches?: number;
    confidence?: number;
  };
  emptyState?: { title: string; message: string };
};

type StateSourceRecord = {
  source: NodeStateSource;
  snapshot: StateSnapshot | null;
  deltas: unknown[];
  raw: unknown;
};

type NumericComparatorOperator = ">" | ">=" | "<" | "<=" | "==" | "!=";

const nodeStatePhases: Array<{ id: NodeStatePhase; label: string }> = [
  { id: "input", label: "Input" },
  { id: "action", label: "Action" },
  { id: "expected_output", label: "Expected Output" },
  { id: "actual_output", label: "Actual Output" }
];

export function buildNodeStateViewModel(input: BuildNodeStateViewModelInput): NodeStateViewModel {
  const nodeId = selectedNodeId(input.selection, input.selectedNode);
  const nodeLabel = selectedNodeLabel(input.selectedNode, nodeId);
  const sourceRecords = collectStateSources(input, nodeId);
  const sources = sourceRecords.map((record) => record.source);
  const bindings = collectEvidenceBindings(input, nodeId);
  const requestedSourceId = input.viewState?.sourceId
    ?? selectionRecord(input.selection).sourceId
    ?? undefined;
  const preferredSourceId = requestedSourceId && sourceRecords.some((record) => record.source.id === requestedSourceId)
    ? requestedSourceId
    : inferPreferredObservedSourceId(input, sourceRecords, bindings, nodeId) ?? requestedSourceId;
  const activeRecord = sourceRecords.find((record) => record.source.id === preferredSourceId) ?? sourceRecords[0] ?? null;
  const activeSource = activeRecord?.source ?? null;
  const activePhase = phaseFrom(input.viewState?.phase ?? selectionRecord(input.selection).phase, activeSource);
  const snapshot = activeRecord?.snapshot ?? null;
  const facts = snapshot ? stateFactsFromSnapshot(snapshot) : [];
  const bindingModels = bindings.map((binding) => evidenceBindingViewModel(binding, input.viewState?.selectedEvidenceId));
  const runtimeComparison = buildRuntimeComparison(input, activeRecord, nodeId, bindings, facts, sourceRecords);
  const overlays = runtimeComparison && activePhase === "actual_output"
    ? buildRuntimeComparisonOverlays(runtimeComparison, input.viewState?.selectedEvidenceId, input.viewState?.selectedFactPath)
    : buildOverlays(bindingModels, facts, input.viewState?.selectedEvidenceId, input.viewState?.selectedFactPath);
  const visualFrame = selectVisualFrame(snapshot);
  const structuredRows = facts.map((fact): StateStructuredRow => {
    const type = stateValueType(fact.rawValue);
    return {
      id: fact.id,
      namespace: fact.namespace,
      path: fact.path,
      label: fact.label,
      value: fact.value,
      ...(type ? { type } : {}),
      ...(fact.confidence !== undefined ? { confidence: `${Math.round(fact.confidence * 100)}%` } : {}),
      ...(fact.source ? { source: fact.source } : {})
    };
  });
  const diffRows = collectDiffRows(activeRecord);
  const evidenceSummary = summarizeEvidence(bindingModels);
  const raw = {
    source: activeSource,
    snapshot,
    visualFrame,
    facts: facts.map((fact) => ({ namespace: fact.namespace, path: fact.path, value: fact.rawValue, observedAt: fact.observedAt, confidence: fact.confidence })),
    evidence: bindings,
    runtimeComparison,
    deltas: activeRecord?.deltas ?? []
  };
  const emptyState = sources.length
    ? facts.length || bindings.length || visualFrame ? undefined : { title: "No state facts", message: "The selected source has no inspectable state values yet." }
    : { title: "No state source", message: nodeId ? "No observed, learned, or runtime state is linked to this node yet." : "Select a node or recording moment to inspect state." };

  return {
    title: nodeId ? `Node State: ${nodeLabel}` : "State View",
    subtitle: activeSource ? `${sourceLabel(activeSource)} | ${phaseLabel(activePhase)}` : "No state source selected",
    sources,
    activeSource,
    phases: nodeStatePhases.map((phase) => ({ ...phase, available: phase.id !== "actual_output" || activeSource?.kind === "runtime" })),
    activePhase,
    ...(visualFrame ? { visualFrame } : {}),
    facts,
    evidence: bindingModels,
    overlays,
    structuredRows,
    diffRows,
    ...(runtimeComparison ? { runtimeComparison } : {}),
    raw,
    summary: {
      facts: facts.length,
      evidence: bindingModels.length,
      ...evidenceSummary,
      ...(runtimeComparison ? { matches: runtimeComparison.matches.length, mismatches: runtimeComparison.mismatches.length } : {}),
      ...(activeSource?.kind === "learned" && activeSource.confidence !== undefined ? { confidence: activeSource.confidence } : {})
    },
    ...(emptyState ? { emptyState } : {})
  };
}

function collectStateSources(input: BuildNodeStateViewModelInput, nodeId: string): StateSourceRecord[] {
  const records: StateSourceRecord[] = [];
  const seen = new Set<string>();
  const add = (record: StateSourceRecord) => {
    if (seen.has(record.source.id)) return;
    seen.add(record.source.id);
    records.push(record);
  };

  for (const learned of learnedSources(input.pipelineArtifacts, nodeId)) add(learned);
  for (const source of observedTimelineSources(input)) {
    const timelineEntries = arrayValue(source.timeline?.timeline ?? source.recording?.timeline);
    for (const [index, entry] of timelineEntries.entries()) {
      const entryRecord = objectRecord(entry);
      const snapshot = stateSnapshotFromTimelineEntry(entryRecord);
      if (snapshot && entryRecord) {
        const recordingId = stringValue(entryRecord.recordingId) ?? source.recordingId;
        const entryId = stringValue(entryRecord.id);
        add({
          source: {
            kind: "observed",
            id: `observed:${recordingId}:${entryId ?? index}`,
            label: entryId ? `Recording ${shortId(recordingId)} @ ${shortId(entryId)}` : `Recording ${shortId(recordingId)}`,
            recordingId,
            ...(entryId ? { timelineEntryId: entryId } : {}),
            timestamp: numberValue(entryRecord.timestamp) ?? snapshot.timestamp
          },
          snapshot,
          deltas: [],
          raw: entryRecord
        });
      }
    }
    const initialState = source.timeline && isStateSnapshot(source.timeline.initialState)
      ? source.timeline.initialState
      : source.recording && isStateSnapshot(source.recording.initialState) ? source.recording.initialState : null;
    if (initialState) {
      add({
        source: {
          kind: "observed",
          id: `observed:${source.recordingId}:initial`,
          label: `Recording ${shortId(source.recordingId)} initial`,
          recordingId: source.recordingId,
          timestamp: initialState.timestamp
        },
        snapshot: initialState,
        deltas: [],
        raw: source.recording ?? source.timeline
      });
    }
  }
  for (const runtime of runtimeSources(input.runtimeSessions)) add(runtime);
  return records;
}

function observedTimelineSources(input: BuildNodeStateViewModelInput): Array<{ recordingId: string; recording?: Record<string, unknown>; timeline?: Record<string, unknown> }> {
  const requestedRecordingIds = new Set<string>();
  const selection = selectionRecord(input.selection);
  const sourceRecordingId = recordingIdFromObservedSourceId(input.viewState?.sourceId ?? selection.sourceId);
  if (selection.recordingId) requestedRecordingIds.add(selection.recordingId);
  if (sourceRecordingId) requestedRecordingIds.add(sourceRecordingId);

  const selectedRecording = objectRecord(input.selectedRecording);
  const selectedTimeline = objectRecord(input.selectedTimeline);
  const selectedRecordingId = stringValue(selectedRecording?.recordingId) ?? stringValue(selectedTimeline?.recordingId);
  if (!requestedRecordingIds.size && selectedRecordingId) requestedRecordingIds.add(selectedRecordingId);

  const recordings = arrayValue(input.recordings).map(objectRecord).filter((record): record is Record<string, unknown> => Boolean(record));
  const timelines = arrayValue(input.timelines).map(objectRecord).filter((record): record is Record<string, unknown> => Boolean(record));
  const candidates: Array<{ recordingId: string; recording?: Record<string, unknown>; timeline?: Record<string, unknown> }> = [];
  const add = (recordingId: string | undefined, recording?: Record<string, unknown>, timeline?: Record<string, unknown>) => {
    if (!recordingId || candidates.some((candidate) => candidate.recordingId === recordingId)) return;
    candidates.push(compactObject({ recordingId, recording, timeline }) as { recordingId: string; recording?: Record<string, unknown>; timeline?: Record<string, unknown> });
  };

  for (const recordingId of requestedRecordingIds) {
    add(recordingId, recordings.find((recording) => stringValue(recording.recordingId) === recordingId) ?? (selectedRecordingId === recordingId ? selectedRecording ?? undefined : undefined), timelines.find((timeline) => stringValue(timeline.recordingId) === recordingId) ?? (selectedRecordingId === recordingId ? selectedTimeline ?? undefined : undefined));
  }
  add(selectedRecordingId, selectedRecording ?? undefined, selectedTimeline ?? undefined);
  if (!candidates.length && (selectedRecording || selectedTimeline)) add(selectedRecordingId ?? "recording", selectedRecording ?? undefined, selectedTimeline ?? undefined);
  return candidates;
}

function learnedSources(artifacts: unknown, nodeId: string): StateSourceRecord[] {
  if (!nodeId) return [];
  const artifactRecord = objectRecord(artifacts);
  const models = arrayValue(artifactRecord?.learnedTaskModels);
  return models.flatMap((model) => {
    const modelRecord = objectRecord(model);
    if (!modelRecord) return [];
    const clusters = arrayValue(modelRecord.actionClusters);
    const matchingCluster = clusters.find((cluster) => {
      const clusterRecord = objectRecord(cluster);
      return stringValue(clusterRecord?.id) === nodeId || stringValue(objectRecord(clusterRecord?.metadata)?.nodeId) === nodeId;
    });
    if (!matchingCluster) return [];
    const recordingIds = arrayValue(modelRecord.sourceRecordings).map(stringValue).filter(isString);
    return [{
      source: compactObject({
        kind: "learned" as const,
        id: `learned:${stringValue(modelRecord.learnedTaskModelId) ?? "model"}:${nodeId}`,
        label: "Learned",
        modelId: stringValue(modelRecord.learnedTaskModelId),
        nodeId,
        recordingIds,
        confidence: numberValue(objectRecord(matchingCluster)?.confidence)
      }) as NodeStateSource,
      snapshot: null,
      deltas: [],
      raw: matchingCluster
    }];
  });
}

function runtimeSources(runtimeSessions: unknown[]): StateSourceRecord[] {
  return runtimeSessions.flatMap((session) => {
    const record = objectRecord(session);
    if (!record) return [];
    const state = firstStateSnapshot(record.metadata, record.trace, record.currentState, record.state);
    if (!state) return [];
    const runId = stringValue(record.runId) ?? "runtime";
    return [{
      source: {
        kind: "runtime" as const,
        id: `runtime:${runId}`,
        label: `Live ${shortId(runId)}`,
        sessionId: runId,
        timestamp: state.timestamp
      },
      snapshot: state,
      deltas: [],
      raw: record
    }];
  });
}

function stateSnapshotFromTimelineEntry(entryRecord: Record<string, unknown> | null | undefined): StateSnapshot | null {
  if (!entryRecord) return null;
  if (entryRecord.type === "state_checkpoint" && isStateSnapshot(entryRecord.state)) return entryRecord.state;
  if (entryRecord.type === "observation" && entryRecord.observationType === "client.state_snapshot") {
    const payload = objectRecord(entryRecord.payload);
    if (isStateSnapshot(payload?.state)) return payload.state;
  }
  return null;
}

function firstStateSnapshot(...values: unknown[]): StateSnapshot | null {
  for (const value of values) {
    if (isStateSnapshot(value)) return value;
    const record = objectRecord(value);
    if (!record) continue;
    for (const candidate of Object.values(record)) {
      if (isStateSnapshot(candidate)) return candidate;
    }
  }
  return null;
}

function stateFactsFromSnapshot(snapshot: StateSnapshot): StateFactViewModel[] {
  const facts: StateFactViewModel[] = [];
  for (const [namespace, stateNamespace] of Object.entries(snapshot.namespaces)) {
    for (const [path, stateValue] of Object.entries(stateNamespace.values)) {
      const presentation = stateValue.presentation;
      const fullPath = `${namespace}.${path}`;
      facts.push({
        id: `${snapshot.id ?? snapshot.timestamp}:${fullPath}`,
        namespace,
        path,
        fullPath,
        label: presentation?.label ?? readablePath(path),
        value: valueSummary(stateValue.value),
        rawValue: stateValue.value,
        observedAt: stateValue.observedAt,
        ...(stateValue.confidence !== undefined ? { confidence: stateValue.confidence } : {}),
        ...(presentation?.anchor ? { anchor: presentation.anchor } : {}),
        ...(stateValue.sourceId ? { source: stateValue.sourceId } : {})
      });
    }
  }
  return facts.sort((left, right) => left.namespace.localeCompare(right.namespace) || left.path.localeCompare(right.path));
}

function collectEvidenceBindings(input: BuildNodeStateViewModelInput, nodeId: string): NodeEvidenceBinding[] {
  const explicit = [
    ...arrayValue(objectRecord(input.pipelineArtifacts)?.nodeEvidenceBindings),
    ...arrayValue(objectRecord(input.selectedNode)?.nodeEvidenceBindings),
    ...arrayValue(objectRecord(objectRecord(input.selectedNode)?.metadata)?.nodeEvidenceBindings),
    ...arrayValue(objectRecord(objectRecord(input.selectedNode)?.metadata)?.evidenceBindings)
  ].filter(isNodeEvidenceBinding);
  const scoped = explicit.filter((binding) => !nodeId || binding.nodeId === nodeId);
  return scoped.length ? scoped : inferredEvidenceBindings(input, nodeId);
}

function inferredEvidenceBindings(input: BuildNodeStateViewModelInput, nodeId: string): NodeEvidenceBinding[] {
  if (!nodeId) return [];
  const artifacts = objectRecord(input.pipelineArtifacts);
  const correlations = arrayValue(artifacts?.stateActionCorrelations).filter(isObjectRecord);
  const claims = arrayValue(artifacts?.evidenceClaims).filter(isObjectRecord);
  const nodeEvidence = nodeEvidenceReferenceIds(input.selectedNode);
  const bindings: NodeEvidenceBinding[] = [];
  for (const correlation of correlations) {
    const correlationId = stringValue(correlation.correlationId);
    const statePath = stringValue(correlation.statePath);
    if (!correlationId || !statePath || (nodeEvidence.size && !nodeEvidence.has(correlationId))) continue;
    const { namespace, path } = splitStatePath(statePath);
    const relation = stringValue(correlation.relation);
    const evidenceReference: EvidenceReference = {
      layer: "state_action_correlation",
      artifactId: correlationId,
      ...(relation ? { relationship: relation } : {})
    };
    const confidence = confidenceFromClaims(claims, correlationId);
    bindings.push({
      id: `binding:${nodeId}:${correlationId}`,
      nodeId,
      fact: {
        namespace,
        path,
        evidence: evidenceReference
      },
      role: roleFromRelation(stringValue(correlation.relation)),
      comparator: comparatorFromRelation(stringValue(correlation.relation)),
      ...(confidence !== undefined ? { confidence } : {}),
      provenance: [evidenceReference]
    });
  }
  return bindings;
}

function evidenceBindingViewModel(binding: NodeEvidenceBinding, selectedEvidenceId: string | undefined): NodeEvidenceBindingViewModel {
  const factPath = `${binding.fact.namespace}.${binding.fact.path}`;
  return {
    id: binding.id,
    nodeId: binding.nodeId,
    factPath,
    role: binding.role,
    label: `${readableToken(binding.role)}: ${readablePath(factPath)}`,
    comparator: comparatorSummary(binding.comparator),
    ...(binding.expectedValue !== undefined ? { expectedValue: valueSummary(binding.expectedValue) } : {}),
    ...(binding.weight !== undefined ? { weight: binding.weight } : {}),
    ...(binding.confidence !== undefined ? { confidence: binding.confidence } : {}),
    ...(binding.anchor ? { anchor: binding.anchor } : {}),
    provenanceCount: binding.provenance?.length ?? 0,
    selected: binding.id === selectedEvidenceId
  };
}

function buildOverlays(bindings: NodeEvidenceBindingViewModel[], facts: StateFactViewModel[], selectedEvidenceId: string | undefined, selectedFactPath: string | undefined): StateOverlayViewModel[] {
  const factsByPath = new Map(facts.map((fact) => [fact.fullPath, fact]));
  return bindings.flatMap((binding) => {
    const fact = factsByPath.get(binding.factPath);
    const anchor = binding.anchor ?? fact?.anchor;
    if (!anchor || anchor.type === "none") return [];
    return [{
      id: `overlay:${binding.id}`,
      label: binding.label,
      role: binding.role,
      tone: overlayTone(binding.role, binding.confidence),
      anchor,
      factPath: binding.factPath,
      evidenceId: binding.id,
      ...(binding.confidence !== undefined ? { confidence: binding.confidence } : {}),
      selected: binding.id === selectedEvidenceId || binding.factPath === selectedFactPath,
      visualTone: visualToneFromStatePath(binding.factPath)
    }];
  });
}

function selectVisualFrame(snapshot: StateSnapshot | null): StateVisualFrame | undefined {
  const frames = snapshot?.presentation?.visualFrames ?? [];
  if (!frames.length) return undefined;
  const defaultFrameId = snapshot?.presentation?.defaultFrameId;
  return frames.find((frame) => frame.id === defaultFrameId) ?? frames[0];
}

function inferPreferredObservedSourceId(input: BuildNodeStateViewModelInput, sourceRecords: StateSourceRecord[], bindings: NodeEvidenceBinding[], nodeId: string): string | undefined {
  const observedSources = sourceRecords.filter((record) => record.source.kind === "observed" && record.snapshot);
  if (!observedSources.length) return undefined;
  const selectedEntryId = selectedTimelineEntryId(input.selection);
  if (selectedEntryId) {
    const exact = observedSources.find((record) => record.source.kind === "observed" && record.source.timelineEntryId === selectedEntryId);
    if (exact) return exact.source.id;
    const timing = timelineEntryTiming(input, selectedEntryId);
    if (timing) {
      const nearest = nearestObservedSourceForTiming(observedSources, timing);
      if (nearest) return nearest.source.id;
    }
  }
  const references = collectNodeStateEntryReferences(input, bindings);
  const actionOffsets = [...references.actionEntryIds]
    .map((entryId) => timelineEntryTiming(input, entryId))
    .filter((timing): timing is { offset?: number; timestamp?: number } => Boolean(timing));
  for (const timing of actionOffsets) {
    const nearest = nearestObservedSourceForTiming(observedSources, timing);
    if (nearest) return nearest.source.id;
  }
  for (const entryId of references.snapshotEntryIds) {
    const exact = observedSources.find((record) => record.source.kind === "observed" && record.source.timelineEntryId === entryId);
    if (exact) return exact.source.id;
  }
  for (const entryId of references.supportEntryIds) {
    const exact = observedSources.find((record) => record.source.kind === "observed" && record.source.timelineEntryId === entryId);
    if (exact) return exact.source.id;
  }
  const orderedActionTiming = inferNodeOrderActionTiming(input, nodeId);
  if (orderedActionTiming) {
    const nearest = nearestObservedSourceForTiming(observedSources, orderedActionTiming);
    if (nearest) return nearest.source.id;
  }
  return undefined;
}

function collectNodeStateEntryReferences(input: BuildNodeStateViewModelInput, bindings: NodeEvidenceBinding[]) {
  const snapshotEntryIds = new Set<string>();
  const supportEntryIds = new Set<string>();
  const actionEntryIds = new Set<string>();
  const correlationIds = new Set<string>();
  const addEvidence = (value: unknown) => {
    const record = objectRecord(value);
    if (!record) return;
    const entryId = stringValue(record.entryId);
    const observationId = stringValue(record.observationId);
    const artifactId = stringValue(record.artifactId);
    const layer = stringValue(record.layer);
    if (artifactId?.startsWith("corr.")) correlationIds.add(artifactId);
    if (layer === "state_action_correlation" && artifactId) correlationIds.add(artifactId);
    if (observationId && timelineEntryIsStateSnapshot(input, observationId)) snapshotEntryIds.add(observationId);
    if (entryId) {
      if (timelineEntryIsStateSnapshot(input, entryId)) snapshotEntryIds.add(entryId);
      else if (layer === "recording" || layer === "raw_recording" || observationId) actionEntryIds.add(entryId);
      else supportEntryIds.add(entryId);
    }
    if (observationId && !timelineEntryIsStateSnapshot(input, observationId)) snapshotEntryIds.add(observationId);
  };

  const selectedNode = objectRecord(input.selectedNode);
  const nodeMetadata = objectRecord(selectedNode?.metadata);
  [
    ...arrayValue(selectedNode?.sourceEvidence),
    ...arrayValue(selectedNode?.evidence),
    ...arrayValue(nodeMetadata?.sourceEvidence),
    ...arrayValue(nodeMetadata?.evidence),
    ...bindings.flatMap((binding) => binding.provenance ?? [])
  ].forEach(addEvidence);

  for (const binding of bindings) {
    const artifactId = stringValue(binding.fact.evidence?.artifactId);
    if (artifactId?.startsWith("corr.")) correlationIds.add(artifactId);
    if (binding.fact.evidence) addEvidence(binding.fact.evidence);
  }

  const artifacts = objectRecord(input.pipelineArtifacts);
  for (const correlation of arrayValue(artifacts?.stateActionCorrelations).filter(isObjectRecord)) {
    const correlationId = stringValue(correlation.correlationId);
    if (correlationIds.size && correlationId && !correlationIds.has(correlationId)) continue;
    if (!correlationIds.size && !nodeEvidenceReferenceIds(input.selectedNode).has(correlationId ?? "")) continue;
    const actionEntryId = stringValue(correlation.actionEntryId);
    if (actionEntryId) actionEntryIds.add(actionEntryId);
    for (const support of arrayValue(correlation.support)) {
      const entryId = stringValue(objectRecord(support)?.entryId);
      if (entryId) supportEntryIds.add(entryId);
    }
  }

  return { snapshotEntryIds, supportEntryIds, actionEntryIds };
}

function nearestObservedSourceForTiming(observedSources: StateSourceRecord[], timing: { offset?: number; timestamp?: number }): StateSourceRecord | undefined {
  const scored = observedSources
    .map((record) => {
      const recordTiming = sourceRecordTiming(record);
      const delta = timing.timestamp !== undefined && recordTiming.timestamp !== undefined
        ? timing.timestamp - recordTiming.timestamp
        : timing.offset !== undefined && recordTiming.offset !== undefined ? timing.offset - recordTiming.offset : Number.POSITIVE_INFINITY;
      return { record, delta };
    })
    .filter((item) => Number.isFinite(item.delta))
    .sort((left, right) => {
      const distance = Math.abs(left.delta) - Math.abs(right.delta);
      if (distance !== 0) return distance;
      const leftBefore = left.delta >= 0;
      const rightBefore = right.delta >= 0;
      if (leftBefore !== rightBefore) return leftBefore ? -1 : 1;
      return 0;
    });
  return scored[0]?.record;
}

function sourceRecordTiming(record: StateSourceRecord): { offset?: number; timestamp?: number } {
  const raw = objectRecord(record.raw);
  const payload = objectRecord(raw?.payload);
  const metadata = objectRecord(payload?.metadata);
  const result: { offset?: number; timestamp?: number } = {};
  const offset = numberValue(raw?.monotonicOffsetMs);
  const timestamp = numberValue(metadata?.eventTimestampMs)
    ?? numberValue(metadata?.stateTimestampMs)
    ?? numberValue(raw?.startedAt)
    ?? numberValue(raw?.timestamp)
    ?? record.snapshot?.timestamp
    ?? (record.source.kind !== "learned" ? record.source.timestamp : undefined);
  if (offset !== undefined) result.offset = offset;
  if (timestamp !== undefined) result.timestamp = timestamp;
  return result;
}

function timelineEntryTiming(input: BuildNodeStateViewModelInput, entryId: string): { offset?: number; timestamp?: number } | null {
  const entry = timelineEntryRecord(input, entryId);
  if (!entry) return null;
  const result: { offset?: number; timestamp?: number } = {};
  const offset = numberValue(entry.monotonicOffsetMs);
  const timestamp = numberValue(entry.startedAt) ?? numberValue(entry.completedAt) ?? numberValue(entry.timestamp);
  if (offset !== undefined) result.offset = offset;
  if (timestamp !== undefined) result.timestamp = timestamp;
  return result;
}

function timelineEntryRecord(input: BuildNodeStateViewModelInput, entryId: string): Record<string, unknown> | null {
  return observedTimelineSources(input)
    .flatMap((source) => arrayValue(source.timeline?.timeline ?? source.recording?.timeline))
    .map(objectRecord)
    .find((record) => record?.id === entryId) ?? null;
}

function timelineEntryIsStateSnapshot(input: BuildNodeStateViewModelInput, entryId: string): boolean {
  return Boolean(stateSnapshotFromTimelineEntry(timelineEntryRecord(input, entryId)));
}

function selectedTimelineEntryId(selection: AutomationSelection | null): string | undefined {
  if (selection?.kind === "timeline") return selection.id;
  if (selection?.kind === "state") return selection.timelineEntryId;
  return undefined;
}

function inferNodeOrderActionTiming(input: BuildNodeStateViewModelInput, nodeId: string): { offset?: number; timestamp?: number } | null {
  if (!nodeId) return null;
  const nodes = orderedPolicyNodes(input);
  const nodeIndex = nodes.findIndex((node) => stringValue(node.id) === nodeId);
  if (nodeIndex < 0) return null;
  const actionEntries = selectedTimelineEntries(input)
    .map(objectRecord)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && isActionLikeTimelineEntry(entry)));
  if (!actionEntries.length || nodeIndex >= actionEntries.length) return null;
  return timingFromRecord(actionEntries[nodeIndex]!);
}

function orderedPolicyNodes(input: BuildNodeStateViewModelInput): Array<Record<string, unknown>> {
  for (const source of [input.policy, input.taskGraph]) {
    const record = objectRecord(source);
    const nodes = arrayValue(record?.nodes).map(objectRecord).filter((node): node is Record<string, unknown> => Boolean(node && stringValue(node.id)));
    if (nodes.length) return nodes;
    const graphNodes = arrayValue(objectRecord(record?.graph)?.nodes).map(objectRecord).filter((node): node is Record<string, unknown> => Boolean(node && stringValue(node.id)));
    if (graphNodes.length) return graphNodes;
  }
  return [];
}

function selectedTimelineEntries(input: BuildNodeStateViewModelInput): unknown[] {
  const selectedTimeline = objectRecord(input.selectedTimeline);
  const selectedRecording = objectRecord(input.selectedRecording);
  return arrayValue(selectedTimeline?.timeline ?? selectedRecording?.timeline);
}

function isActionLikeTimelineEntry(entry: Record<string, unknown>): boolean {
  const type = stringValue(entry.type);
  if (type === "action" || type === "client_action" || type === "recorded_action" || type === "interaction") return true;
  if (stringValue(entry.actionType)) return true;
  if (objectRecord(entry.action)) return true;
  return false;
}

function timingFromRecord(record: Record<string, unknown>): { offset?: number; timestamp?: number } | null {
  const result: { offset?: number; timestamp?: number } = {};
  const offset = numberValue(record.monotonicOffsetMs);
  const timestamp = numberValue(record.startedAt) ?? numberValue(record.completedAt) ?? numberValue(record.timestamp);
  if (offset !== undefined) result.offset = offset;
  if (timestamp !== undefined) result.timestamp = timestamp;
  return result.offset !== undefined || result.timestamp !== undefined ? result : null;
}

function collectDiffRows(activeRecord: StateSourceRecord | null): StateDiffRow[] {
  return (activeRecord?.deltas ?? []).flatMap((delta, index) => {
    const record = objectRecord(delta);
    if (!record) return [];
    const namespace = stringValue(record.namespace) ?? stringValue(objectRecord(record.path)?.namespace) ?? "state";
    const path = typeof record.path === "string" ? record.path : stringValue(objectRecord(record.path)?.path) ?? String(index);
    return [{
      id: `delta:${namespace}.${path}:${index}`,
      path: `${namespace}.${path}`,
      change: stringValue(record.change) ?? "changed",
      before: valueSummary(objectRecord(record.previous)?.value ?? record.previous),
      after: valueSummary(objectRecord(record.current)?.value ?? record.current),
      ...(typeof record.confidence === "number" ? { confidence: `${Math.round(record.confidence * 100)}%` } : {})
    }];
  });
}

function buildRuntimeComparison(input: BuildNodeStateViewModelInput, activeRecord: StateSourceRecord | null, nodeId: string, bindings: NodeEvidenceBinding[], facts: StateFactViewModel[], sourceRecords: StateSourceRecord[]): NodeStateRuntimeComparisonViewModel | undefined {
  if (activeRecord?.source.kind !== "runtime" || !nodeId) return undefined;
  const explicit = findRuntimeComparison(input, activeRecord.raw, nodeId, activeRecord.source.id);
  if (explicit) return runtimeComparisonFromContract(explicit, bindings, facts);
  const expectedBindings = bindings.filter((binding) => binding.role === "expectation" || binding.role === "invariant");
  if (!expectedBindings.length && !facts.length) return undefined;
  const expectedSourceId = sourceRecords.find((record) => record.source.kind !== "runtime")?.source.id ?? `expected:${nodeId}`;
  const actualSourceId = activeRecord.source.id;
  const factsByPath = new Map(facts.map((fact) => [fact.fullPath, fact]));
  const matches: NodeStateRuntimeComparisonRow[] = [];
  const mismatches: NodeStateRuntimeComparisonRow[] = [];
  const boundFactPaths = new Set<string>();
  for (const binding of expectedBindings) {
    const factPath = `${binding.fact.namespace}.${binding.fact.path}`;
    boundFactPaths.add(factPath);
    const fact = factsByPath.get(factPath);
    const expected = expectedValueForBinding(binding);
    const matched = fact ? comparatorMatches(binding.comparator, fact.rawValue) : false;
    const base = compactComparisonRow({
      id: `${matched ? "match" : "mismatch"}:${binding.id}`,
      status: matched ? "match" : "mismatch",
      evidenceId: binding.id,
      factPath,
      label: readablePath(factPath),
      expected: expected,
      actual: fact ? fact.value : "-",
      score: matched ? binding.confidence ?? binding.weight ?? fact?.confidence : undefined,
      severity: matched ? undefined : "error",
      anchor: binding.anchor ?? fact?.anchor
    });
    if (matched) matches.push(base);
    else mismatches.push(base);
  }
  const irrelevant = facts
    .filter((fact) => !boundFactPaths.has(fact.fullPath))
    .map((fact) => compactComparisonRow({
      id: `irrelevant:${fact.id}`,
      status: "irrelevant",
      factPath: fact.fullPath,
      label: fact.label,
      expected: "Irrelevant",
      actual: fact.value,
      anchor: fact.anchor
    }));
  return compactRuntimeComparisonViewModel({
    expectedSourceId,
    actualSourceId,
    nodeId,
    confidence: comparisonConfidence(matches.length, mismatches.length),
    matches,
    mismatches,
    irrelevant,
    rows: [...mismatches, ...matches, ...irrelevant]
  });
}

function findRuntimeComparison(input: BuildNodeStateViewModelInput, activeRaw: unknown, nodeId: string, actualSourceId: string): NodeStateRuntimeComparison | null {
  const candidates = [
    objectRecord(activeRaw)?.runtimeComparison,
    objectRecord(objectRecord(activeRaw)?.metadata)?.runtimeComparison,
    objectRecord(input.pipelineArtifacts)?.runtimeComparison,
    ...arrayValue(objectRecord(input.pipelineArtifacts)?.runtimeComparisons)
  ];
  for (const candidate of candidates) {
    if (isNodeStateRuntimeComparison(candidate) && candidate.nodeId === nodeId && candidate.actualSourceId === actualSourceId) return candidate;
  }
  return null;
}

function runtimeComparisonFromContract(comparison: NodeStateRuntimeComparison, bindings: NodeEvidenceBinding[], facts: StateFactViewModel[]): NodeStateRuntimeComparisonViewModel {
  const bindingsById = new Map(bindings.map((binding) => [binding.id, binding]));
  const factsByPath = new Map(facts.map((fact) => [fact.fullPath, fact]));
  const boundFactPaths = new Set([...comparison.matches, ...comparison.mismatches].map((item) => item.factPath));
  const matches = comparison.matches.map((item) => {
    const binding = bindingsById.get(item.evidenceId);
    const fact = factsByPath.get(item.factPath);
    return compactComparisonRow({
      id: `match:${item.evidenceId}:${item.factPath}`,
      status: "match",
      evidenceId: item.evidenceId,
      factPath: item.factPath,
      label: readablePath(item.factPath),
      expected: binding ? expectedValueForBinding(binding) : "Expected",
      actual: fact?.value ?? "-",
      score: item.score,
      anchor: binding?.anchor ?? fact?.anchor
    });
  });
  const mismatches = comparison.mismatches.map((item) => {
    const binding = bindingsById.get(item.evidenceId);
    const fact = factsByPath.get(item.factPath);
    return compactComparisonRow({
      id: `mismatch:${item.evidenceId}:${item.factPath}`,
      status: "mismatch",
      evidenceId: item.evidenceId,
      factPath: item.factPath,
      label: readablePath(item.factPath),
      expected: valueSummary(item.expected),
      actual: valueSummary(item.actual),
      severity: item.severity,
      anchor: binding?.anchor ?? fact?.anchor
    });
  });
  const irrelevant = facts
    .filter((fact) => !boundFactPaths.has(fact.fullPath))
    .map((fact) => compactComparisonRow({
      id: `irrelevant:${fact.id}`,
      status: "irrelevant",
      factPath: fact.fullPath,
      label: fact.label,
      expected: "Irrelevant",
      actual: fact.value,
      anchor: fact.anchor
    }));
  return compactRuntimeComparisonViewModel({
    expectedSourceId: comparison.expectedSourceId,
    actualSourceId: comparison.actualSourceId,
    nodeId: comparison.nodeId,
    confidence: comparison.confidence,
    matches,
    mismatches,
    irrelevant,
    rows: [...mismatches, ...matches, ...irrelevant]
  });
}

function buildRuntimeComparisonOverlays(comparison: NodeStateRuntimeComparisonViewModel, selectedEvidenceId: string | undefined, selectedFactPath: string | undefined): StateOverlayViewModel[] {
  return comparison.rows.flatMap((row) => {
    if (!row.anchor || row.anchor.type === "none") return [];
    const tone: StateOverlayTone = row.status === "match" ? "positive" : row.status === "mismatch" ? "mismatch" : "neutral";
    return [compactObject({
      id: `overlay:${row.id}`,
      label: row.label,
      role: row.status === "mismatch" ? "failure" : row.status === "match" ? "expectation" : "ignored",
      tone,
      anchor: row.anchor,
      factPath: row.factPath,
      evidenceId: row.evidenceId,
      confidence: row.score,
      selected: row.evidenceId === selectedEvidenceId || row.factPath === selectedFactPath,
      visualTone: visualToneFromStatePath(row.factPath)
    }) as StateOverlayViewModel];
  });
}

function expectedValueForBinding(binding: NodeEvidenceBinding): string {
  if (binding.expectedValue !== undefined) return valueSummary(binding.expectedValue);
  const comparator = binding.comparator;
  if (comparator.kind === "equals" || comparator.kind === "not_equals") return valueSummary(comparator.value);
  if (comparator.kind === "numeric") return `${comparator.operator} ${comparator.value}`;
  if (comparator.kind === "exists") return "Exists";
  if (comparator.kind === "changed") return "Changed";
  return `Custom ${comparator.comparatorId}`;
}

function comparatorMatches(comparator: NodeEvidenceBinding["comparator"], actual: unknown): boolean {
  if (comparator.kind === "exists") return actual !== undefined && actual !== null && actual !== "";
  if (comparator.kind === "equals") return valuesEqual(actual, comparator.value);
  if (comparator.kind === "not_equals") return !valuesEqual(actual, comparator.value);
  if (comparator.kind === "numeric") return typeof actual === "number" && numericComparatorMatches(actual, comparator.operator, comparator.value);
  if (comparator.kind === "changed") return actual !== undefined;
  return true;
}

function numericComparatorMatches(actual: number, operator: NumericComparatorOperator, expected: number): boolean {
  if (operator === ">") return actual > expected;
  if (operator === ">=") return actual >= expected;
  if (operator === "<") return actual < expected;
  if (operator === "<=") return actual <= expected;
  if (operator === "==") return actual === expected;
  return actual !== expected;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function comparisonConfidence(matches: number, mismatches: number): number | undefined {
  const total = matches + mismatches;
  return total ? matches / total : undefined;
}

function summarizeEvidence(evidence: NodeEvidenceBindingViewModel[]) {
  let strong = 0;
  let weak = 0;
  let negative = 0;
  let ignored = 0;
  for (const item of evidence) {
    if (item.role === "ignored") ignored += 1;
    else if (item.role === "negative_eligibility" || item.role === "failure") negative += 1;
    else if ((item.confidence ?? item.weight ?? 1) < 0.6) weak += 1;
    else strong += 1;
  }
  return { strong, weak, negative, ignored };
}

function phaseFrom(value: unknown, source: NodeStateSource | null): NodeStatePhase {
  if (value === "input" || value === "action" || value === "expected_output" || value === "actual_output") {
    return value === "actual_output" && source?.kind !== "runtime" ? "input" : value;
  }
  return "input";
}

function selectionRecord(selection: AutomationSelection | null): { sourceId?: string; phase?: NodeStatePhase; recordingId?: string; proposalId?: string; timelineEntryId?: string } {
  const record = objectRecord(selection);
  return compactObject({
    sourceId: stringValue(record?.sourceId),
    phase: phaseFrom(record?.phase, null),
    recordingId: stringValue(record?.recordingId),
    proposalId: stringValue(record?.proposalId),
    timelineEntryId: stringValue(record?.timelineEntryId)
  }) as { sourceId?: string; phase?: NodeStatePhase; recordingId?: string; proposalId?: string; timelineEntryId?: string };
}

function recordingIdFromObservedSourceId(sourceId: string | undefined): string | undefined {
  if (!sourceId) return undefined;
  const match = /^observed:([^:]+):/.exec(sourceId);
  return match?.[1];
}

function selectedNodeId(selection: AutomationSelection | null, selectedNode: unknown): string {
  const nodeRecord = objectRecord(selectedNode);
  return stringValue(nodeRecord?.id)
    ?? stringValue(objectRecord(nodeRecord?.node)?.id)
    ?? (selection?.kind === "node" || selection?.kind === "editor-node" ? selection.id : "")
    ?? "";
}

function selectedNodeLabel(selectedNode: unknown, nodeId: string): string {
  const record = objectRecord(selectedNode);
  return stringValue(record?.label) ?? stringValue(objectRecord(record?.node)?.label) ?? (nodeId || "Selected Node");
}

function sourceLabel(source: NodeStateSource): string {
  if (source.kind === "learned") return `${source.label} (${source.recordingIds.length} recording${source.recordingIds.length === 1 ? "" : "s"})`;
  return source.label;
}

function phaseLabel(phase: NodeStatePhase): string {
  return nodeStatePhases.find((item) => item.id === phase)?.label ?? readableToken(phase);
}

function overlayTone(role: NodeEvidenceRole, confidence = 1): StateOverlayTone {
  if (role === "negative_eligibility" || role === "failure") return "negative";
  if (role === "ignored") return "neutral";
  if (confidence < 0.6) return "weak";
  return "positive";
}

function visualToneFromStatePath(path: string): StateVisualTone {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".href") || normalized.includes(".url")) return "link";
  if (normalized.includes(".image") || normalized.includes(".img") || normalized.includes(".video") || normalized.includes(".canvas") || normalized.includes(".media")) return "media";
  if (normalized.includes(".nav") || normalized.includes(".menu") || normalized.includes(".tab") || normalized.includes(".breadcrumb")) return "navigation";
  if (normalized.includes(".list") || normalized.includes(".item") || normalized.includes(".row") || normalized.includes(".cell") || normalized.includes(".option")) return "list";
  if (normalized.includes(".status") || normalized.includes(".alert") || normalized.includes(".error") || normalized.includes(".warning") || normalized.includes(".toast")) return "status";
  if (normalized.includes(".value") || normalized.includes(".input")) return "input";
  if (normalized.includes(".text") || normalized.includes(".label") || normalized.includes(".title")) return "text";
  if (normalized.includes(".button") || normalized.includes(".control") || normalized.includes(".action")) return "control";
  if (normalized.includes(".enabled") || normalized.includes(".visible") || normalized.includes(".bounds")) return "region";
  if (normalized.includes(".selected") || normalized.includes(".focus")) return "selected";
  return "unknown";
}

function roleFromRelation(relation: string | undefined): NodeEvidenceRole {
  if (!relation) return "context";
  if (relation.includes("before")) return "eligibility";
  if (relation.includes("after") || relation.includes("changed") || relation.includes("appeared") || relation.includes("disappeared")) return "expectation";
  return "context";
}

function comparatorFromRelation(relation: string | undefined): NodeEvidenceBinding["comparator"] {
  if (relation?.includes("changed") || relation?.includes("appeared") || relation?.includes("disappeared")) return { kind: "changed" };
  return { kind: "exists" };
}

function confidenceFromClaims(claims: Array<Record<string, unknown>>, correlationId: string): number | undefined {
  const claim = claims.find((item) => arrayValue(item.sourceEvidence).some((source) => stringValue(objectRecord(source)?.artifactId) === correlationId));
  return numberValue(objectRecord(claim?.confidence)?.score);
}

function nodeEvidenceReferenceIds(node: unknown): Set<string> {
  const record = objectRecord(node);
  const sources = [
    ...arrayValue(record?.sourceEvidence),
    ...arrayValue(objectRecord(record?.metadata)?.evidence),
    ...arrayValue(objectRecord(record?.metadata)?.sourceEvidence)
  ];
  return new Set(sources.map((source) => stringValue(objectRecord(source)?.artifactId)).filter(isString));
}

function comparatorSummary(comparator: NodeEvidenceBinding["comparator"]): string {
  if (comparator.kind === "exists") return "exists";
  if (comparator.kind === "changed") return "changed";
  if (comparator.kind === "equals") return `equals ${valueSummary(comparator.value)}`;
  if (comparator.kind === "not_equals") return `does not equal ${valueSummary(comparator.value)}`;
  if (comparator.kind === "numeric") return `${comparator.operator} ${comparator.value}`;
  return `custom ${comparator.comparatorId}`;
}

function splitStatePath(value: string): { namespace: string; path: string } {
  const [namespace, ...pathParts] = value.split(".");
  return { namespace: namespace || "state", path: pathParts.join(".") || value };
}

function isStateSnapshot(value: unknown): value is StateSnapshot {
  const record = objectRecord(value);
  return Boolean(record && typeof record.timestamp === "number" && record.namespaces && typeof record.namespaces === "object" && !Array.isArray(record.namespaces));
}

function isNodeEvidenceBinding(value: unknown): value is NodeEvidenceBinding {
  const record = objectRecord(value);
  return Boolean(record && stringValue(record.id) && stringValue(record.nodeId) && objectRecord(record.fact) && objectRecord(record.comparator) && typeof record.role === "string");
}

function isNodeStateRuntimeComparison(value: unknown): value is NodeStateRuntimeComparison {
  const record = objectRecord(value);
  return Boolean(
    record
    && stringValue(record.expectedSourceId)
    && stringValue(record.actualSourceId)
    && stringValue(record.nodeId)
    && record.phase === "actual_output"
    && Array.isArray(record.matches)
    && Array.isArray(record.mismatches)
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return isObjectRecord(value) ? value : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function stateValueType(value: unknown): string | undefined {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "undefined" ? undefined : typeof value;
}

function readablePath(path: string): string {
  return path.split(".").filter(Boolean).map(readableToken).join(" / ") || "-";
}

function readableToken(value: unknown): string {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "-";
}

function valueSummary(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? `${value.length} items` : "[]";
  if (typeof value === "object") {
    const valueRecord = value as Partial<StateValue>;
    if ("value" in valueRecord) return valueSummary(valueRecord.value);
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 3).map(([key, item]) => `${readableToken(key)}: ${valueSummary(item)}`);
    return entries.length ? entries.join("; ") : "{}";
  }
  return String(value);
}

function shortId(value: string): string {
  return value.length > 14 ? value.slice(0, 8) : value;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function compactComparisonRow(value: Record<string, unknown>): NodeStateRuntimeComparisonRow {
  return compactObject(value) as unknown as NodeStateRuntimeComparisonRow;
}

function compactRuntimeComparisonViewModel(value: Record<string, unknown>): NodeStateRuntimeComparisonViewModel {
  return compactObject(value) as unknown as NodeStateRuntimeComparisonViewModel;
}
