import type {
  ActionVisualEntityTarget,
} from "./actions.ts";
import type {
  AutomationConditionExpression,
} from "./conditions.ts";
import type {
  EvidenceComparator,
  EvidenceReference,
  NodeEvidenceBinding,
  StateFact,
  StateFactReference
} from "./evidence.ts";
import type {
  PolicyGraph,
} from "./policies.ts";
import type {
  RecordingSession,
} from "./recordings.ts";
import type {
  NodeStateRuntimeComparison,
  NodeStateSource,
  NodeStateViewSelection
} from "./node-state.ts";
import type {
  SignalRegistry,
} from "./signals.ts";
import type {
  TimelineEntry
} from "./timeline.ts";
import type {
  EvidenceAnchor,
  StatePath,
  StateBounds,
  StateCoordinateSpace,
  StatePresentationMetadata,
  StateSnapshot,
  StateVisualFrame,
  StateVisualLayer
} from "./state.ts";
import type {
  AutomationStudioFlowArtifact,
  AutomationStudioFlowInterface,
  AutomationStudioFlowPort,
  AutomationStudioFlowValueType,
  AutomationStudioFlowVariable
} from "./flows.ts";
import { validateAutomationStudioFlowRegions } from "./regions.ts";
import type { JsonValue } from "../../../core/index.ts";

export type AutomationStudioValidationSeverity = "error" | "warning" | "info";

export type AutomationStudioValidationIssue = {
  severity: AutomationStudioValidationSeverity;
  code: string;
  message: string;
  path: string;
};

export type AutomationStudioValidationResult = {
  ok: boolean;
  issues: AutomationStudioValidationIssue[];
};

export function validateRecordingSession(recording: RecordingSession): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  const entryIds = new Set<string>();
  const noteIds = new Set(recording.notes.map((note) => note.id));
  const sourceIds = new Set(recording.sources.map((source) => source.id));

  if (!recording.recordingId) {
    addIssue(issues, "error", "recording.missing_id", "Recording must have a recordingId.", "recordingId");
  }
  if (recording.initialState.timestamp < recording.startedAt) {
    addIssue(issues, "warning", "recording.initial_state_before_start", "Initial state timestamp is before recording start.", "initialState.timestamp");
  }
  if (recording.endedAt !== undefined && recording.endedAt < recording.startedAt) {
    addIssue(issues, "error", "recording.ends_before_start", "Recording endedAt must be greater than or equal to startedAt.", "endedAt");
  }

  let previousSequence = -1;
  for (const [index, entry] of recording.timeline.entries()) {
    const path = `timeline.${index}`;
    if (entry.recordingId !== recording.recordingId) {
      addIssue(issues, "error", "timeline.recording_id_mismatch", "Timeline entry recordingId must match the parent recording.", `${path}.recordingId`);
    }
    if (entryIds.has(entry.id)) {
      addIssue(issues, "error", "timeline.duplicate_entry_id", `Duplicate timeline entry id "${entry.id}".`, `${path}.id`);
    }
    entryIds.add(entry.id);
    if (entry.sequence <= previousSequence) {
      addIssue(issues, "error", "timeline.sequence_not_increasing", "Timeline entry sequence values must be strictly increasing.", `${path}.sequence`);
    }
    previousSequence = entry.sequence;
    if (!sourceIds.has(entry.sourceId)) {
      addIssue(issues, "warning", "timeline.unknown_source", `Timeline entry references unknown source "${entry.sourceId}".`, `${path}.sourceId`);
    }
    validateTimelineEntry(entry, issues, path, noteIds);
  }

  for (const [index, note] of recording.notes.entries()) {
    const path = `notes.${index}`;
    for (const linkedEntryId of note.linkedEntryIds ?? []) {
      if (!entryIds.has(linkedEntryId)) {
        addIssue(issues, "warning", "note.missing_linked_entry", `Note links to missing timeline entry "${linkedEntryId}".`, `${path}.linkedEntryIds`);
      }
    }
  }

  return result(issues);
}

export function validateSignalRegistry(registry: SignalRegistry): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  const paths = new Set<string>();

  for (const [index, definition] of registry.definitions.entries()) {
    const path = `definitions.${index}`;
    if (!definition.path) {
      addIssue(issues, "error", "signal.missing_path", "Signal definition must have a path.", `${path}.path`);
    }
    if (paths.has(definition.path)) {
      addIssue(issues, "error", "signal.duplicate_path", `Duplicate signal path "${definition.path}".`, `${path}.path`);
    }
    paths.add(definition.path);
    if (definition.defaultWeight < 0 || definition.defaultWeight > 1) {
      addIssue(issues, "error", "signal.invalid_weight", "Signal defaultWeight must be between 0 and 1.", `${path}.defaultWeight`);
    }
    if (definition.derived && !definition.provenance) {
      addIssue(issues, "warning", "signal.derived_without_provenance", "Derived signals should retain extractor provenance.", `${path}.provenance`);
    }
  }

  return result(issues);
}

export function validatePolicyGraph(policy: PolicyGraph): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const [index, node] of policy.nodes.entries()) {
    const path = `nodes.${index}`;
    if (nodeIds.has(node.id)) {
      addIssue(issues, "error", "policy.duplicate_node_id", `Duplicate policy node id "${node.id}".`, `${path}.id`);
    }
    nodeIds.add(node.id);
    if (node.actions.length === 0) {
      addIssue(issues, "warning", "policy.node_without_actions", `Policy node "${node.id}" has no actions.`, `${path}.actions`);
    }
    if (node.timeout.timeoutMs <= 0) {
      addIssue(issues, "error", "policy.invalid_timeout", "Node timeoutMs must be greater than zero.", `${path}.timeout.timeoutMs`);
    }
    if (node.retry.maxAttempts < 0) {
      addIssue(issues, "error", "policy.invalid_retry", "Node retry maxAttempts must be zero or greater.", `${path}.retry.maxAttempts`);
    }
    validateConditionExpression(node.eligibility, issues, `${path}.eligibility`);
    validateConditionExpression(node.successConditions, issues, `${path}.successConditions`);
    if (node.readinessConditions) validateConditionExpression(node.readinessConditions, issues, `${path}.readinessConditions`);
    if (node.failureConditions) validateConditionExpression(node.failureConditions, issues, `${path}.failureConditions`);
    if (node.invariants) validateConditionExpression(node.invariants, issues, `${path}.invariants`);
  }

  for (const [index, edge] of policy.edges.entries()) {
    const path = `edges.${index}`;
    if (edgeIds.has(edge.id)) {
      addIssue(issues, "error", "policy.duplicate_edge_id", `Duplicate policy edge id "${edge.id}".`, `${path}.id`);
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.fromNodeId)) {
      addIssue(issues, "error", "policy.edge_missing_from_node", `Policy edge references missing fromNodeId "${edge.fromNodeId}".`, `${path}.fromNodeId`);
    }
    if (!nodeIds.has(edge.toNodeId)) {
      addIssue(issues, "error", "policy.edge_missing_to_node", `Policy edge references missing toNodeId "${edge.toNodeId}".`, `${path}.toNodeId`);
    }
    if (edge.probability !== undefined && (edge.probability < 0 || edge.probability > 1)) {
      addIssue(issues, "error", "policy.invalid_edge_probability", "Policy edge probability must be between 0 and 1.", `${path}.probability`);
    }
    if (edge.condition) validateConditionExpression(edge.condition, issues, `${path}.condition`);
  }

  for (const [nodeIndex, node] of policy.nodes.entries()) {
    for (const [edgeIndex, edge] of node.outgoingEdges.entries()) {
      const path = `nodes.${nodeIndex}.outgoingEdges.${edgeIndex}`;
      if (edge.fromNodeId !== node.id) {
        addIssue(issues, "error", "policy.node_edge_from_mismatch", "Node outgoing edge fromNodeId must match the owning node.", `${path}.fromNodeId`);
      }
      if (!nodeIds.has(edge.toNodeId)) {
        addIssue(issues, "error", "policy.node_edge_missing_to_node", `Node outgoing edge references missing toNodeId "${edge.toNodeId}".`, `${path}.toNodeId`);
      }
    }
  }

  return result(issues);
}

export function validateStateSnapshot(snapshot: StateSnapshot): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (snapshot.id !== undefined && !snapshot.id.trim()) {
    addIssue(issues, "error", "state.snapshot_empty_id", "State snapshot id cannot be empty when provided.", "id");
  }
  if (!Number.isFinite(snapshot.timestamp)) {
    addIssue(issues, "error", "state.snapshot_invalid_timestamp", "State snapshot timestamp must be finite.", "timestamp");
  }
  for (const [namespace, stateNamespace] of Object.entries(snapshot.namespaces)) {
    const namespacePath = `namespaces.${namespace}`;
    if (!namespace.trim()) addIssue(issues, "error", "state.namespace_empty_id", "State namespace id cannot be empty.", namespacePath);
    for (const [valuePath, value] of Object.entries(stateNamespace.values)) {
      if (!valuePath.trim()) addIssue(issues, "error", "state.value_empty_path", "State value path cannot be empty.", `${namespacePath}.values`);
      if (!Number.isFinite(value.observedAt)) addIssue(issues, "error", "state.value_invalid_observed_at", "State value observedAt must be finite.", `${namespacePath}.values.${valuePath}.observedAt`);
      if (value.confidence !== undefined && (value.confidence < 0 || value.confidence > 1)) addIssue(issues, "error", "state.value_invalid_confidence", "State value confidence must be between 0 and 1.", `${namespacePath}.values.${valuePath}.confidence`);
      if (value.presentation) validateStatePresentationMetadata(value.presentation, issues, `${namespacePath}.values.${valuePath}.presentation`);
    }
  }
  const frames = snapshot.presentation?.visualFrames ?? [];
  const frameIds = new Set<string>();
  for (const [index, frame] of frames.entries()) {
    const path = `presentation.visualFrames.${index}`;
    validateStateVisualFrame(frame, issues, path);
    if (frameIds.has(frame.id)) addIssue(issues, "error", "state.visual_frame_duplicate_id", `Duplicate state visual frame id "${frame.id}".`, `${path}.id`);
    frameIds.add(frame.id);
  }
  if (snapshot.presentation?.defaultFrameId && !frameIds.has(snapshot.presentation.defaultFrameId)) {
    addIssue(issues, "error", "state.visual_frame_missing_default", `Default visual frame "${snapshot.presentation.defaultFrameId}" is not present.`, "presentation.defaultFrameId");
  }
  return result(issues);
}

export function validateActionVisualEntityTarget(target: ActionVisualEntityTarget): AutomationStudioValidationResult;
export function validateActionVisualEntityTarget(target: ActionVisualEntityTarget, issues: AutomationStudioValidationIssue[], path: string): void;
export function validateActionVisualEntityTarget(target: ActionVisualEntityTarget, issues?: AutomationStudioValidationIssue[], path = "visualTarget"): AutomationStudioValidationResult | void {
  const localIssues = issues ?? [];
  if (!target.entityId.trim()) addIssue(localIssues, "error", "action.visual_target_missing_entity", "Action visual target must include an entityId.", `${path}.entityId`);
  if (target.entityKind !== undefined && !target.entityKind.trim()) addIssue(localIssues, "error", "action.visual_target_empty_entity_kind", "Action visual target entityKind cannot be empty when provided.", `${path}.entityKind`);
  if (target.visualFrameId !== undefined && !target.visualFrameId.trim()) addIssue(localIssues, "error", "action.visual_target_empty_frame", "Action visual target visualFrameId cannot be empty when provided.", `${path}.visualFrameId`);
  if (target.visualLayerId !== undefined && !target.visualLayerId.trim()) addIssue(localIssues, "error", "action.visual_target_empty_layer", "Action visual target visualLayerId cannot be empty when provided.", `${path}.visualLayerId`);
  if (target.stateSnapshotId !== undefined && !target.stateSnapshotId.trim()) addIssue(localIssues, "error", "action.visual_target_empty_state", "Action visual target stateSnapshotId cannot be empty when provided.", `${path}.stateSnapshotId`);
  if (target.confidence !== undefined && (target.confidence < 0 || target.confidence > 1)) addIssue(localIssues, "error", "action.visual_target_invalid_confidence", "Action visual target confidence must be between 0 and 1.", `${path}.confidence`);
  if (target.source !== undefined && target.source !== "importer" && target.source !== "runtime" && target.source !== "inferred" && target.source !== "operator") {
    addIssue(localIssues, "error", "action.visual_target_invalid_source", "Action visual target source must be importer, runtime, inferred, or operator.", `${path}.source`);
  }
  if (target.statePath) validateStatePath(target.statePath, localIssues, `${path}.statePath`);
  if (target.anchor) validateEvidenceAnchor(target.anchor, localIssues, `${path}.anchor`);
  if (!issues) return result(localIssues);
}

export function validateStateFactReference(fact: StateFactReference): AutomationStudioValidationResult;
export function validateStateFactReference(fact: StateFactReference, issues: AutomationStudioValidationIssue[], path: string): void;
export function validateStateFactReference(fact: StateFactReference, issues?: AutomationStudioValidationIssue[], path = "fact"): AutomationStudioValidationResult | void {
  const localIssues = issues ?? [];
  if (fact.snapshotId !== undefined && !fact.snapshotId.trim()) addIssue(localIssues, "error", "evidence.fact_empty_snapshot_id", "State fact snapshotId cannot be empty when provided.", `${path}.snapshotId`);
  if (!fact.namespace.trim()) addIssue(localIssues, "error", "evidence.fact_missing_namespace", "State fact reference must include a namespace.", `${path}.namespace`);
  if (!fact.path.trim()) addIssue(localIssues, "error", "evidence.fact_missing_path", "State fact reference must include a path.", `${path}.path`);
  if (fact.observedAt !== undefined && !Number.isFinite(fact.observedAt)) addIssue(localIssues, "error", "evidence.fact_invalid_observed_at", "State fact observedAt must be finite.", `${path}.observedAt`);
  if (fact.evidence) validateEvidenceReference(fact.evidence, localIssues, `${path}.evidence`);
  if (!issues) return result(localIssues);
}

export function validateStateFact(fact: StateFact): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  validateStateFactReference(fact, issues, "fact");
  if (fact.id !== undefined && !fact.id.trim()) addIssue(issues, "error", "evidence.fact_empty_id", "State fact id cannot be empty when provided.", "fact.id");
  if (fact.confidence !== undefined && (fact.confidence < 0 || fact.confidence > 1)) addIssue(issues, "error", "evidence.fact_invalid_confidence", "State fact confidence must be between 0 and 1.", "fact.confidence");
  if (fact.anchor) validateEvidenceAnchor(fact.anchor, issues, "fact.anchor");
  return result(issues);
}

export function validateNodeEvidenceBinding(binding: NodeEvidenceBinding): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!binding.id.trim()) addIssue(issues, "error", "evidence.binding_missing_id", "Node evidence binding must have an id.", "id");
  if (!binding.nodeId.trim()) addIssue(issues, "error", "evidence.binding_missing_node_id", "Node evidence binding must have a nodeId.", "nodeId");
  validateStateFactReference(binding.fact, issues, "fact");
  validateEvidenceComparator(binding.comparator, issues, "comparator");
  if (binding.weight !== undefined && (binding.weight < 0 || binding.weight > 1)) addIssue(issues, "error", "evidence.binding_invalid_weight", "Node evidence binding weight must be between 0 and 1.", "weight");
  if (binding.confidence !== undefined && (binding.confidence < 0 || binding.confidence > 1)) addIssue(issues, "error", "evidence.binding_invalid_confidence", "Node evidence binding confidence must be between 0 and 1.", "confidence");
  if (binding.anchor) validateEvidenceAnchor(binding.anchor, issues, "anchor");
  binding.provenance?.forEach((reference, index) => validateEvidenceReference(reference, issues, `provenance.${index}`));
  return result(issues);
}

export function validateNodeStateSource(source: NodeStateSource): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!source.id.trim()) addIssue(issues, "error", "node_state.source_missing_id", "Node state source must have an id.", "id");
  if (!source.label.trim()) addIssue(issues, "error", "node_state.source_missing_label", "Node state source must have a label.", "label");
  if (source.kind === "learned") {
    if (!source.nodeId.trim()) addIssue(issues, "error", "node_state.learned_missing_node_id", "Learned node state source must include a nodeId.", "nodeId");
    if (source.modelId !== undefined && !source.modelId.trim()) addIssue(issues, "error", "node_state.learned_empty_model_id", "Learned node state modelId cannot be empty when provided.", "modelId");
    if (!source.recordingIds.length) addIssue(issues, "warning", "node_state.learned_without_recordings", "Learned node state source should retain contributing recording IDs.", "recordingIds");
    source.recordingIds.forEach((recordingId, index) => {
      if (!recordingId.trim()) addIssue(issues, "error", "node_state.learned_empty_recording_id", "Learned node state recordingIds cannot contain empty IDs.", `recordingIds.${index}`);
    });
    if (source.confidence !== undefined && (source.confidence < 0 || source.confidence > 1)) addIssue(issues, "error", "node_state.learned_invalid_confidence", "Learned node state confidence must be between 0 and 1.", "confidence");
  } else if (source.kind === "observed") {
    if (!source.recordingId.trim()) addIssue(issues, "error", "node_state.observed_missing_recording_id", "Observed node state source must include a recordingId.", "recordingId");
    if (source.timelineEntryId !== undefined && !source.timelineEntryId.trim()) addIssue(issues, "error", "node_state.observed_empty_timeline_entry_id", "Observed node state timelineEntryId cannot be empty when provided.", "timelineEntryId");
    if (!Number.isFinite(source.timestamp)) addIssue(issues, "error", "node_state.observed_invalid_timestamp", "Observed node state source timestamp must be finite.", "timestamp");
  } else if (source.kind === "runtime") {
    if (source.sessionId !== undefined && !source.sessionId.trim()) addIssue(issues, "error", "node_state.runtime_empty_session_id", "Runtime node state sessionId cannot be empty when provided.", "sessionId");
    if (!Number.isFinite(source.timestamp)) addIssue(issues, "error", "node_state.runtime_invalid_timestamp", "Runtime node state source timestamp must be finite.", "timestamp");
  }
  return result(issues);
}

export function validateNodeStateViewSelection(selection: NodeStateViewSelection): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (selection.sourceId !== undefined && !selection.sourceId.trim()) addIssue(issues, "error", "node_state.selection_empty_source_id", "Node state view sourceId cannot be empty when provided.", "sourceId");
  return result(issues);
}

export function validateNodeStateRuntimeComparison(comparison: NodeStateRuntimeComparison): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!comparison.expectedSourceId.trim()) addIssue(issues, "error", "node_state.comparison_missing_expected_source", "Runtime comparison must include an expectedSourceId.", "expectedSourceId");
  if (!comparison.actualSourceId.trim()) addIssue(issues, "error", "node_state.comparison_missing_actual_source", "Runtime comparison must include an actualSourceId.", "actualSourceId");
  if (!comparison.nodeId.trim()) addIssue(issues, "error", "node_state.comparison_missing_node_id", "Runtime comparison must include a nodeId.", "nodeId");
  if (comparison.phase !== "actual_output") addIssue(issues, "error", "node_state.comparison_invalid_phase", "Runtime comparison phase must be actual_output.", "phase");
  comparison.matches.forEach((item, index) => {
    validateRuntimeComparisonPath(item.evidenceId, issues, `matches.${index}.evidenceId`, "node_state.comparison_match_missing_evidence", "Runtime comparison match must include an evidenceId.");
    validateRuntimeComparisonPath(item.factPath, issues, `matches.${index}.factPath`, "node_state.comparison_match_missing_fact", "Runtime comparison match must include a factPath.");
    if (item.score !== undefined && (item.score < 0 || item.score > 1)) addIssue(issues, "error", "node_state.comparison_match_invalid_score", "Runtime comparison match score must be between 0 and 1.", `matches.${index}.score`);
  });
  comparison.mismatches.forEach((item, index) => {
    validateRuntimeComparisonPath(item.evidenceId, issues, `mismatches.${index}.evidenceId`, "node_state.comparison_mismatch_missing_evidence", "Runtime comparison mismatch must include an evidenceId.");
    validateRuntimeComparisonPath(item.factPath, issues, `mismatches.${index}.factPath`, "node_state.comparison_mismatch_missing_fact", "Runtime comparison mismatch must include a factPath.");
    if (item.severity !== "warning" && item.severity !== "error") addIssue(issues, "error", "node_state.comparison_mismatch_invalid_severity", "Runtime comparison mismatch severity must be warning or error.", `mismatches.${index}.severity`);
  });
  if (comparison.confidence !== undefined && (comparison.confidence < 0 || comparison.confidence > 1)) addIssue(issues, "error", "node_state.comparison_invalid_confidence", "Runtime comparison confidence must be between 0 and 1.", "confidence");
  return result(issues);
}

export function validateStateVisualFrame(frame: StateVisualFrame): AutomationStudioValidationResult;
export function validateStateVisualFrame(frame: StateVisualFrame, issues: AutomationStudioValidationIssue[], path: string): void;
export function validateStateVisualFrame(frame: StateVisualFrame, issues?: AutomationStudioValidationIssue[], path = "visualFrame"): AutomationStudioValidationResult | void {
  const localIssues = issues ?? [];
  if (!frame.id.trim()) addIssue(localIssues, "error", "state.visual_frame_missing_id", "State visual frame must have an id.", `${path}.id`);
  if (frame.rendererId !== undefined && !frame.rendererId.trim()) addIssue(localIssues, "error", "state.visual_frame_empty_renderer", "State visual frame rendererId cannot be empty.", `${path}.rendererId`);
  validateStateCoordinateSpace(frame.coordinateSpace, localIssues, `${path}.coordinateSpace`);
  const layerIds = new Set<string>();
  for (const [index, layer] of frame.layers.entries()) {
    const layerPath = `${path}.layers.${index}`;
    validateStateVisualLayer(layer, localIssues, layerPath);
    if (layerIds.has(layer.id)) addIssue(localIssues, "error", "state.visual_layer_duplicate_id", `Duplicate state visual layer id "${layer.id}".`, `${layerPath}.id`);
    layerIds.add(layer.id);
  }
  if (frame.presentation) validateStatePresentationMetadata(frame.presentation, localIssues, `${path}.presentation`);
  if (!issues) return result(localIssues);
}

export function validateEvidenceAnchor(anchor: EvidenceAnchor): AutomationStudioValidationResult;
export function validateEvidenceAnchor(anchor: EvidenceAnchor, issues: AutomationStudioValidationIssue[], path: string): void;
export function validateEvidenceAnchor(anchor: EvidenceAnchor, issues?: AutomationStudioValidationIssue[], path = "anchor"): AutomationStudioValidationResult | void {
  const localIssues = issues ?? [];
  if (anchor.type === "point") {
    validateFiniteCoordinate(anchor.x, localIssues, `${path}.x`);
    validateFiniteCoordinate(anchor.y, localIssues, `${path}.y`);
  } else if (anchor.type === "bounds") {
    validateStateBounds(anchor.bounds, localIssues, `${path}.bounds`);
    validateOptionalStateBoundsKind(anchor.boundsKind, localIssues, `${path}.boundsKind`);
  } else if (anchor.type === "element" && !anchor.elementId.trim()) {
    addIssue(localIssues, "error", "state.anchor_missing_element", "Element anchor must have an elementId.", `${path}.elementId`);
  } else if (anchor.type === "entity" && !anchor.entityId.trim()) {
    addIssue(localIssues, "error", "state.anchor_missing_entity", "Entity anchor must have an entityId.", `${path}.entityId`);
  } else if (anchor.type === "region" && !anchor.regionId.trim()) {
    addIssue(localIssues, "error", "state.anchor_missing_region", "Region anchor must have a regionId.", `${path}.regionId`);
  } else if (anchor.type === "path") {
    if (anchor.points.length < 2) addIssue(localIssues, "error", "state.anchor_path_too_short", "Path anchor must have at least two points.", `${path}.points`);
    anchor.points.forEach((point, index) => {
      validateFiniteCoordinate(point.x, localIssues, `${path}.points.${index}.x`);
      validateFiniteCoordinate(point.y, localIssues, `${path}.points.${index}.y`);
    });
  }
  if ("rendererId" in anchor && anchor.rendererId !== undefined && !anchor.rendererId.trim()) {
    addIssue(localIssues, "error", "state.anchor_empty_renderer", "Anchor rendererId cannot be empty.", `${path}.rendererId`);
  }
  if (!issues) return result(localIssues);
}

/**
 * Validates the owner-independent Flow contract used by new authoring paths.
 * Node-definition/port resolution is intentionally deferred until the node
 * registry contract exists; this validator only proves local graph structure.
 */
export function validateAutomationStudioFlow(flow: AutomationStudioFlowArtifact): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!flow.flowId.trim()) addIssue(issues, "error", "flow.missing_id", "Flow must have a flowId.", "flowId");
  if (!flow.projectId.trim()) addIssue(issues, "error", "flow.missing_project_id", "Flow must have a projectId.", "projectId");
  if (!flow.name.trim()) addIssue(issues, "error", "flow.missing_name", "Flow must have a name.", "name");
  if (flow.updatedAt < flow.createdAt) addIssue(issues, "error", "flow.updated_before_created", "Flow updatedAt must be greater than or equal to createdAt.", "updatedAt");

  if (flow.scope.kind === "domain" && !flow.scope.domainId.trim()) {
    addIssue(issues, "error", "flow.missing_domain_id", "Domain-scoped Flow must have a domainId.", "scope.domainId");
  }
  if (flow.source.mode === "code" && !flow.source.moduleId.trim()) {
    addIssue(issues, "error", "flow.missing_code_module", "Code-owned Flow must have a moduleId.", "source.moduleId");
  }
  if (flow.source.mode === "code" && (!flow.source.sourceDigest?.trim() || !flow.source.compiledDigest?.trim() || !flow.source.compilerVersion?.trim())) {
    addIssue(issues, "error", "flow.incomplete_code_compilation", "Code-owned Flow must retain source, compiler, and compiled-plan digests.", "source");
  }

  validateFlowInterface(flow.interface, issues, "interface");
  validateFlowVariables(flow.variables, issues);
  validateFlowErrors(flow.errors, issues);
  validateFlowGraph(flow, issues);
  issues.push(...validateAutomationStudioFlowRegions({
    ...(flow.regions ? { regions: flow.regions } : {}),
    ...(flow.regionHandoffs ? { handoffs: flow.regionHandoffs } : {}),
    nodeIds: flow.nodes.map((node) => node.id),
    scope: flow.scope
  }).issues);
  validateFlowExecutionDefaults(flow, issues);
  validateFlowPublication(flow, issues);
  return result(issues);
}

function validateFlowInterface(
  value: AutomationStudioFlowInterface,
  issues: AutomationStudioValidationIssue[],
  path: string
): void {
  validateFlowPorts(value.inputs, issues, `${path}.inputs`);
  validateFlowPorts(value.outputs, issues, `${path}.outputs`);
}

function validateFlowPorts(ports: AutomationStudioFlowPort[], issues: AutomationStudioValidationIssue[], path: string): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [index, port] of ports.entries()) {
    const portPath = `${path}.${index}`;
    if (!port.id.trim()) addIssue(issues, "error", "flow.port_missing_id", "Flow port must have an id.", `${portPath}.id`);
    if (!port.name.trim()) addIssue(issues, "error", "flow.port_missing_name", "Flow port must have a name.", `${portPath}.name`);
    if (ids.has(port.id)) addIssue(issues, "error", "flow.duplicate_port_id", `Duplicate Flow port id "${port.id}".`, `${portPath}.id`);
    if (names.has(port.name)) addIssue(issues, "error", "flow.duplicate_port_name", `Duplicate Flow port name "${port.name}".`, `${portPath}.name`);
    ids.add(port.id);
    names.add(port.name);
    validateFlowValueType(port.valueType, issues, `${portPath}.valueType`);
    if (port.defaultValue !== undefined && !valueMatchesFlowType(port.defaultValue, port.valueType)) {
      addIssue(issues, "error", "flow.port_default_type_mismatch", `Default value for port "${port.id}" does not match its declared type.`, `${portPath}.defaultValue`);
    }
  }
}

function validateFlowVariables(variables: AutomationStudioFlowVariable[], issues: AutomationStudioValidationIssue[]): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [index, variable] of variables.entries()) {
    const path = `variables.${index}`;
    if (!variable.id.trim()) addIssue(issues, "error", "flow.variable_missing_id", "Flow variable must have an id.", `${path}.id`);
    if (!variable.name.trim()) addIssue(issues, "error", "flow.variable_missing_name", "Flow variable must have a name.", `${path}.name`);
    if (ids.has(variable.id)) addIssue(issues, "error", "flow.duplicate_variable_id", `Duplicate Flow variable id "${variable.id}".`, `${path}.id`);
    if (names.has(variable.name)) addIssue(issues, "error", "flow.duplicate_variable_name", `Duplicate Flow variable name "${variable.name}".`, `${path}.name`);
    ids.add(variable.id);
    names.add(variable.name);
    validateFlowValueType(variable.valueType, issues, `${path}.valueType`);
    if (variable.initialValue !== undefined && !valueMatchesFlowType(variable.initialValue, variable.valueType)) {
      addIssue(issues, "error", "flow.variable_initial_type_mismatch", `Initial value for variable "${variable.id}" does not match its declared type.`, `${path}.initialValue`);
    }
  }
}

function validateFlowErrors(errors: AutomationStudioFlowArtifact["errors"], issues: AutomationStudioValidationIssue[]): void {
  const ids = new Set<string>();
  for (const [index, error] of errors.entries()) {
    const path = `errors.${index}.id`;
    if (!error.id.trim()) addIssue(issues, "error", "flow.error_missing_id", "Flow error must have an id.", path);
    if (ids.has(error.id)) addIssue(issues, "error", "flow.duplicate_error_id", `Duplicate Flow error id "${error.id}".`, path);
    ids.add(error.id);
  }
}

function validateFlowGraph(flow: AutomationStudioFlowArtifact, issues: AutomationStudioValidationIssue[]): void {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  for (const [index, node] of flow.nodes.entries()) {
    const path = `nodes.${index}`;
    if (!node.id.trim()) addIssue(issues, "error", "flow.node_missing_id", "Flow node must have an id.", `${path}.id`);
    if (!node.definitionId.trim()) addIssue(issues, "error", "flow.node_missing_definition", "Flow node must have a definitionId.", `${path}.definitionId`);
    if (node.definitionVersion !== undefined && !isSemanticVersion(node.definitionVersion)) addIssue(issues, "error", "flow.node_invalid_definition_version", "Flow node definitionVersion must use major.minor.patch semantic versioning.", `${path}.definitionVersion`);
    if (nodeIds.has(node.id)) addIssue(issues, "error", "flow.duplicate_node_id", `Duplicate Flow node id "${node.id}".`, `${path}.id`);
    nodeIds.add(node.id);
  }
  for (const [index, edge] of flow.edges.entries()) {
    const path = `edges.${index}`;
    if (!edge.id.trim()) addIssue(issues, "error", "flow.edge_missing_id", "Flow edge must have an id.", `${path}.id`);
    if (edgeIds.has(edge.id)) addIssue(issues, "error", "flow.duplicate_edge_id", `Duplicate Flow edge id "${edge.id}".`, `${path}.id`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.sourceNodeId)) addIssue(issues, "error", "flow.edge_missing_source_node", `Flow edge references missing source node "${edge.sourceNodeId}".`, `${path}.sourceNodeId`);
    if (!nodeIds.has(edge.targetNodeId)) addIssue(issues, "error", "flow.edge_missing_target_node", `Flow edge references missing target node "${edge.targetNodeId}".`, `${path}.targetNodeId`);
    if ((edge.sourcePortId === undefined) !== (edge.targetPortId === undefined)) {
      addIssue(issues, "error", "flow.edge_incomplete_port_binding", "Flow edge must declare both sourcePortId and targetPortId or neither.", path);
    }
  }
}

function validateFlowExecutionDefaults(flow: AutomationStudioFlowArtifact, issues: AutomationStudioValidationIssue[]): void {
  const defaults = flow.executionDefaults;
  if (!defaults) return;
  if (defaults.timeoutMs !== undefined && defaults.timeoutMs <= 0) addIssue(issues, "error", "flow.invalid_timeout", "Flow timeoutMs must be greater than zero.", "executionDefaults.timeoutMs");
  if (defaults.maxConcurrency !== undefined && (!Number.isInteger(defaults.maxConcurrency) || defaults.maxConcurrency <= 0)) {
    addIssue(issues, "error", "flow.invalid_max_concurrency", "Flow maxConcurrency must be a positive integer.", "executionDefaults.maxConcurrency");
  }
  if (defaults.authorizedDomainIds?.some((domainId) => !domainId.trim())) addIssue(issues, "error", "flow.invalid_authorized_domain", "authorizedDomainIds cannot contain empty domain IDs.", "executionDefaults.authorizedDomainIds");
  if (flow.scope.kind !== "global" && defaults.authorizedDomainIds?.length) addIssue(issues, "error", "flow.domain_scope_cross_grant", "Only global Flows may declare authorizedDomainIds.", "executionDefaults.authorizedDomainIds");
}

function validateFlowPublication(flow: AutomationStudioFlowArtifact, issues: AutomationStudioValidationIssue[]): void {
  const publication = flow.publication;
  if (flow.visibility === "public" && publication.status !== "published" && publication.status !== "deprecated") {
    addIssue(issues, "error", "flow.public_requires_published_version", "Public Flow must have a published version.", "publication.status");
  }
  if (publication.status === "published" || publication.status === "deprecated") {
    if (!isSemanticVersion(publication.version)) addIssue(issues, "error", "flow.invalid_published_version", "Published Flow version must use major.minor.patch semantic versioning.", "publication.version");
    if (publication.publishedAt < flow.createdAt) addIssue(issues, "error", "flow.published_before_created", "Flow publishedAt cannot precede createdAt.", "publication.publishedAt");
    if (!publication.flowDigest.trim()) addIssue(issues, "error", "flow.missing_published_digest", "Published Flow must have an immutable flowDigest.", "publication.flowDigest");
    validateFlowInterface(publication.interface, issues, "publication.interface");
    if (!publication.snapshot) addIssue(issues, "error", "flow.published_snapshot_missing", "Published Flow must retain its immutable execution snapshot.", "publication.snapshot");
    else if (publication.snapshot.flowDigest !== publication.flowDigest || publication.snapshot.version !== publication.version || publication.snapshot.flowId !== flow.flowId) {
      addIssue(issues, "error", "flow.published_snapshot_mismatch", "Published Flow snapshot identity and digest must match the current publication.", "publication.snapshot");
    }
  }
  const historyKeys = new Set<string>();
  for (const [index, snapshot] of (flow.publicationHistory ?? []).entries()) {
    const key = `${snapshot.flowId}@${snapshot.version}`;
    if (snapshot.flowId !== flow.flowId) addIssue(issues, "error", "flow.publication_history_flow_mismatch", "Publication history snapshot must belong to this Flow.", `publicationHistory.${index}.flowId`);
    if (!isSemanticVersion(snapshot.version)) addIssue(issues, "error", "flow.publication_history_invalid_version", "Publication history version must use semantic versioning.", `publicationHistory.${index}.version`);
    if (!snapshot.flowDigest.trim()) addIssue(issues, "error", "flow.publication_history_missing_digest", "Publication history snapshot must retain a digest.", `publicationHistory.${index}.flowDigest`);
    if (historyKeys.has(key)) addIssue(issues, "error", "flow.publication_history_duplicate_version", `Publication history contains duplicate version ${snapshot.version}.`, `publicationHistory.${index}.version`);
    historyKeys.add(key);
  }
}

function validateFlowValueType(valueType: AutomationStudioFlowValueType, issues: AutomationStudioValidationIssue[], path: string): void {
  if (valueType.kind === "array") {
    validateFlowValueType(valueType.item, issues, `${path}.item`);
  } else if (valueType.kind === "record" && valueType.properties) {
    for (const [key, property] of Object.entries(valueType.properties)) {
      if (!key.trim()) addIssue(issues, "error", "flow.record_property_missing_name", "Record type property must have a name.", `${path}.properties.${key}`);
      validateFlowValueType(property, issues, `${path}.properties.${key}`);
    }
  } else if (valueType.kind === "schema" && !valueType.schemaId.trim()) {
    addIssue(issues, "error", "flow.schema_type_missing_id", "Schema value type must have a schemaId.", `${path}.schemaId`);
  }
}

function valueMatchesFlowType(value: JsonValue, valueType: AutomationStudioFlowValueType): boolean {
  switch (valueType.kind) {
    case "unknown":
    case "json": return true;
    case "string": return typeof value === "string";
    case "number": return typeof value === "number";
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    case "schema": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array": return Array.isArray(value) && value.every((item) => valueMatchesFlowType(item, valueType.item));
    case "record": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
      const record = value as Record<string, JsonValue>;
      const properties = valueType.properties ?? {};
      if (Object.entries(properties).some(([key, type]) => key in record && !valueMatchesFlowType(record[key]!, type))) return false;
      return valueType.additionalProperties !== false || Object.keys(record).every((key) => key in properties);
    }
  }
}

function isSemanticVersion(value: string): boolean {
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value);
}

function validateTimelineEntry(
  entry: TimelineEntry,
  issues: AutomationStudioValidationIssue[],
  path: string,
  noteIds: Set<string>
): void {
  if (entry.confidence !== undefined && (entry.confidence < 0 || entry.confidence > 1)) {
    addIssue(issues, "error", "timeline.invalid_confidence", "Timeline entry confidence must be between 0 and 1.", `${path}.confidence`);
  }
  if (entry.type === "note" && !noteIds.has(entry.noteId)) {
    addIssue(issues, "warning", "timeline.missing_note", `Note entry references missing note "${entry.noteId}".`, `${path}.noteId`);
  }
  if (entry.type === "action" && entry.visualTarget) validateActionVisualEntityTarget(entry.visualTarget, issues, `${path}.visualTarget`);
  if (entry.type === "state_delta" && entry.deltas.length === 0) {
    addIssue(issues, "warning", "timeline.empty_state_delta", "State delta entries should contain at least one delta.", `${path}.deltas`);
  }
}

function validateStatePath(statePath: StatePath, issues: AutomationStudioValidationIssue[], path: string): void {
  if (!statePath.namespace.trim()) addIssue(issues, "error", "state.path_missing_namespace", "State path namespace cannot be empty.", `${path}.namespace`);
  if (!statePath.path.trim()) addIssue(issues, "error", "state.path_missing_path", "State path path cannot be empty.", `${path}.path`);
}

function validateStateCoordinateSpace(space: StateCoordinateSpace, issues: AutomationStudioValidationIssue[], path: string): void {
  validatePositiveFinite(space.width, issues, `${path}.width`, "State coordinate space width must be a positive finite number.");
  validatePositiveFinite(space.height, issues, `${path}.height`, "State coordinate space height must be a positive finite number.");
  if (space.scale !== undefined) validatePositiveFinite(space.scale, issues, `${path}.scale`, "State coordinate space scale must be a positive finite number.");
}

function validateStateVisualLayer(layer: StateVisualLayer, issues: AutomationStudioValidationIssue[], path: string): void {
  if (!layer.id.trim()) addIssue(issues, "error", "state.visual_layer_missing_id", "State visual layer must have an id.", `${path}.id`);
  validateOptionalStateBoundsKind(layer.boundsKind, issues, `${path}.boundsKind`);
  if ("renderKind" in layer) validateOptionalStateRenderKind(layer.renderKind, issues, `${path}.renderKind`);
  if ("isVisibleOnViewport" in layer && layer.isVisibleOnViewport !== undefined && typeof layer.isVisibleOnViewport !== "boolean") {
    addIssue(issues, "error", "state.visual_layer_invalid_viewport_visibility", "State visual layer isVisibleOnViewport must be boolean.", `${path}.isVisibleOnViewport`);
  }
  if (layer.kind === "image") {
    if (!isAllowedStateContentRef(layer.contentRef)) {
      addIssue(issues, "error", "state.visual_layer_unsafe_content_ref", "Image layer contentRef must be an Automation Studio object or API reference.", `${path}.contentRef`);
    }
    validateStateBounds(layer.bounds, issues, `${path}.bounds`);
    if (layer.opacity !== undefined && (layer.opacity < 0 || layer.opacity > 1)) {
      addIssue(issues, "error", "state.visual_layer_invalid_opacity", "Image layer opacity must be between 0 and 1.", `${path}.opacity`);
    }
    return;
  }
  if (layer.kind === "text") {
    if (layer.bounds) validateStateBounds(layer.bounds, issues, `${path}.bounds`);
    if (layer.anchor) validateEvidenceAnchor(layer.anchor, issues, `${path}.anchor`);
    return;
  }
  if (layer.kind === "region") {
    validateStateBounds(layer.bounds, issues, `${path}.bounds`);
    if (layer.anchor) validateEvidenceAnchor(layer.anchor, issues, `${path}.anchor`);
    return;
  }
  if (layer.kind === "element") {
    if (layer.bounds) validateStateBounds(layer.bounds, issues, `${path}.bounds`);
    if (layer.anchor) validateEvidenceAnchor(layer.anchor, issues, `${path}.anchor`);
  }
}

function validateStatePresentationMetadata(presentation: StatePresentationMetadata, issues: AutomationStudioValidationIssue[], path: string): void {
  if (presentation.order !== undefined && !Number.isFinite(presentation.order)) {
    addIssue(issues, "error", "state.presentation_invalid_order", "State presentation order must be finite.", `${path}.order`);
  }
  if (presentation.anchor) validateEvidenceAnchor(presentation.anchor, issues, `${path}.anchor`);
}

function validateEvidenceComparator(comparator: EvidenceComparator, issues: AutomationStudioValidationIssue[], path: string): void {
  if (comparator.kind === "numeric" && !Number.isFinite(comparator.value)) {
    addIssue(issues, "error", "evidence.comparator_invalid_numeric_value", "Numeric evidence comparator value must be finite.", `${path}.value`);
  }
  if (comparator.kind === "custom" && !comparator.comparatorId.trim()) {
    addIssue(issues, "error", "evidence.comparator_missing_custom_id", "Custom evidence comparator must have a comparatorId.", `${path}.comparatorId`);
  }
}

function validateEvidenceReference(reference: EvidenceReference, issues: AutomationStudioValidationIssue[], path: string): void {
  if (!reference.artifactId.trim()) addIssue(issues, "error", "evidence.reference_missing_artifact", "Evidence reference must have an artifactId.", `${path}.artifactId`);
  if (reference.entryId !== undefined && !reference.entryId.trim()) addIssue(issues, "error", "evidence.reference_empty_entry", "Evidence reference entryId cannot be empty when provided.", `${path}.entryId`);
  if (reference.signalPath !== undefined && !reference.signalPath.trim()) addIssue(issues, "error", "evidence.reference_empty_signal_path", "Evidence reference signalPath cannot be empty when provided.", `${path}.signalPath`);
  if (reference.noteId !== undefined && !reference.noteId.trim()) addIssue(issues, "error", "evidence.reference_empty_note", "Evidence reference noteId cannot be empty when provided.", `${path}.noteId`);
  if (reference.relationship !== undefined && !reference.relationship.trim()) addIssue(issues, "error", "evidence.reference_empty_relationship", "Evidence reference relationship cannot be empty when provided.", `${path}.relationship`);
  if (reference.confidence !== undefined && (reference.confidence < 0 || reference.confidence > 1)) addIssue(issues, "error", "evidence.reference_invalid_confidence", "Evidence reference confidence must be between 0 and 1.", `${path}.confidence`);
}

function validateStateBounds(bounds: StateBounds, issues: AutomationStudioValidationIssue[], path: string): void {
  validateFiniteCoordinate(bounds.x, issues, `${path}.x`);
  validateFiniteCoordinate(bounds.y, issues, `${path}.y`);
  validatePositiveFinite(bounds.width, issues, `${path}.width`, "State bounds width must be a positive finite number.");
  validatePositiveFinite(bounds.height, issues, `${path}.height`, "State bounds height must be a positive finite number.");
}

function validateOptionalStateBoundsKind(value: unknown, issues: AutomationStudioValidationIssue[], path: string): void {
  if (value === undefined || value === "screenshot" || value === "document") return;
  addIssue(issues, "error", "state.invalid_bounds_kind", "State boundsKind must be screenshot or document.", path);
}

function validateOptionalStateRenderKind(value: unknown, issues: AutomationStudioValidationIssue[], path: string): void {
  if (value === undefined || value === "screenshot-bbox" || value === "direct-rendered") return;
  addIssue(issues, "error", "state.invalid_render_kind", "State renderKind must be screenshot-bbox or direct-rendered.", path);
}

function validateFiniteCoordinate(value: number, issues: AutomationStudioValidationIssue[], path: string): void {
  if (!Number.isFinite(value)) addIssue(issues, "error", "state.coordinate_not_finite", "State coordinates must be finite numbers.", path);
}

function validatePositiveFinite(value: number, issues: AutomationStudioValidationIssue[], path: string, message: string): void {
  if (!Number.isFinite(value) || value <= 0) addIssue(issues, "error", "state.dimension_not_positive", message, path);
}

function isAllowedStateContentRef(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("automation-object://")
    || trimmed.startsWith("fluxiq-object://")
    || trimmed.startsWith("object://")
    || trimmed.startsWith("/api/");
}

function validateRuntimeComparisonPath(value: string, issues: AutomationStudioValidationIssue[], path: string, code: string, message: string): void {
  if (!value.trim()) addIssue(issues, "error", code, message, path);
}

function validateConditionExpression(
  expression: AutomationConditionExpression,
  issues: AutomationStudioValidationIssue[],
  path: string
): void {
  if ("conditions" in expression) {
    if (expression.conditions.length === 0) {
      addIssue(issues, "warning", "condition.empty_group", "Condition groups should contain at least one condition.", `${path}.conditions`);
    }
    if (expression.type === "weighted" && (expression.threshold < 0 || expression.threshold > 1)) {
      addIssue(issues, "error", "condition.invalid_threshold", "Weighted condition threshold must be between 0 and 1.", `${path}.threshold`);
    }
    for (const [index, child] of expression.conditions.entries()) {
      validateConditionExpression(child, issues, `${path}.conditions.${index}`);
    }
    return;
  }

  if (!expression.signalPath) {
    addIssue(issues, "error", "condition.missing_signal_path", "Condition must reference a signalPath.", `${path}.signalPath`);
  }
  if (expression.weight !== undefined && (expression.weight < 0 || expression.weight > 1)) {
    addIssue(issues, "error", "condition.invalid_weight", "Condition weight must be between 0 and 1.", `${path}.weight`);
  }
}

function addIssue(
  issues: AutomationStudioValidationIssue[],
  severity: AutomationStudioValidationSeverity,
  code: string,
  message: string,
  path: string
): void {
  issues.push({ severity, code, message, path });
}

function result(issues: AutomationStudioValidationIssue[]): AutomationStudioValidationResult {
  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}
