import type {
  AutomationConditionExpression,
} from "./conditions.ts";
import type {
  PolicyGraph,
} from "./policies.ts";
import type {
  RecordingSession,
} from "./recordings.ts";
import type {
  SignalRegistry,
} from "./signals.ts";
import type {
  TimelineEntry
} from "./timeline.ts";

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
  if (entry.type === "state_delta" && entry.deltas.length === 0) {
    addIssue(issues, "warning", "timeline.empty_state_delta", "State delta entries should contain at least one delta.", `${path}.deltas`);
  }
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
