import type { JsonObject } from "../../../core/index.ts";
import type { ActionVisualEntityTarget, StatePath } from "../model/index.ts";
import { parseAutomationStudioObjectContentRef } from "./object-store.ts";

export const RECORDING_STATE_INDEX_SCHEMA_VERSION = "0.2" as const;

export type RecordingIndexSchemaVersion = typeof RECORDING_STATE_INDEX_SCHEMA_VERSION;

export type RecordingIndex = {
  schemaVersion: RecordingIndexSchemaVersion;
  projectId: string;
  recordingId: string;
  summary: RecordingIndexSummary;
  timeline: RecordingTimelineIndex;
  entries: Record<string, RecordingEntryIndexItem>;
  actions: Record<string, RecordingActionIndexItem>;
  states: Record<string, RecordingStateIndexItem>;
  proposals: Record<string, RecordingProposalIndexItem>;
};

export type RecordingIndexSummary = {
  name?: string;
  startedAt: number;
  endedAt?: number;
  eventCount: number;
  actionCount: number;
  stateSnapshotCount: number;
  proposalCount: number;
  updatedAt: number;
};

export type RecordingTimelineIndex = {
  timelineRef: string;
  firstEntryId?: string;
  lastEntryId?: string;
};

export type RecordingEntryIndexItem = {
  entryId: string;
  type: string;
  timestamp?: number;
  startedAt?: number;
  completedAt?: number;
  monotonicOffsetMs?: number;
  sequence?: number;
  stateSnapshotId?: string;
  actionId?: string;
  objectRefs?: string[];
};

export type RecordingActionIndexItem = {
  actionId: string;
  entryId: string;
  actionType: string;
  outputId?: string;
  startedAt?: number;
  completedAt?: number;
  stateBeforeId?: string;
  stateAtActionId?: string;
  stateAfterId?: string;
  visualTarget?: RecordingActionVisualTargetIndexItem;
  sourceObjectRefs?: string[];
};

export type RecordingActionVisualTargetIndexItem = {
  entityId?: string;
  entityKind?: string;
  statePath?: StatePath;
  stateSnapshotId?: string;
  visualFrameId?: string;
  visualLayerId?: string;
  confidence?: number;
};

export type RecordingStateIndexItem = {
  stateSnapshotId: string;
  entryId: string;
  timestamp: number;
  monotonicOffsetMs?: number;
  stateRef: string;
  screenshotRef?: string;
  visualFrameId?: string;
  coordinateSpace?: RecordingStateCoordinateSpace;
  objectRefs: string[];
  linkedActionIds: string[];
};

export type RecordingStateCoordinateSpace = {
  width: number;
  height: number;
  unit: "px";
  origin: "top-left";
};

export type RecordingProposalIndexItem = {
  proposalId: string;
  recordingId: string;
  kind: "policy" | "recording_flow" | "llm_assisted" | "direct" | string;
  status: string;
  generatedAt?: number;
  updatedAt: number;
  nodeCount?: number;
  stateSnapshotIds?: string[];
  objectRefs?: string[];
};

export type ProposalNodeStateLink = {
  recordingId: string;
  actionEntryId: string;
  actionId?: string;
  stateSnapshotId: string;
  stateRef: string;
  screenshotRef?: string;
};

export type RecordingStateIndexValidationIssue = {
  code:
    | "invalid_schema_version"
    | "invalid_identity"
    | "invalid_summary"
    | "entry_key_mismatch"
    | "action_key_mismatch"
    | "state_key_mismatch"
    | "proposal_key_mismatch"
    | "missing_entry"
    | "missing_action"
    | "missing_state"
    | "missing_state_ref"
    | "invalid_object_ref"
    | "cross_project_ref"
    | "proposal_recording_mismatch";
  path: string;
  message: string;
};

export type EmptyRecordingIndexInput = {
  projectId: string;
  recordingId: string;
  name?: string;
  startedAt?: number;
  endedAt?: number;
  updatedAt?: number;
  timelineRef?: string;
};

export function emptyRecordingIndex(input: EmptyRecordingIndexInput): RecordingIndex {
  const now = input.updatedAt ?? Date.now();
  return sortRecordingIndex({
    schemaVersion: RECORDING_STATE_INDEX_SCHEMA_VERSION,
    projectId: input.projectId,
    recordingId: input.recordingId,
    summary: {
      ...(input.name ? { name: input.name } : {}),
      startedAt: input.startedAt ?? now,
      ...(input.endedAt !== undefined ? { endedAt: input.endedAt } : {}),
      eventCount: 0,
      actionCount: 0,
      stateSnapshotCount: 0,
      proposalCount: 0,
      updatedAt: now
    },
    timeline: { timelineRef: input.timelineRef ?? "timeline.jsonl" },
    entries: {},
    actions: {},
    states: {},
    proposals: {}
  });
}

export function isRecordingIndex(value: unknown): value is RecordingIndex {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<RecordingIndex>;
  return candidate.schemaVersion === RECORDING_STATE_INDEX_SCHEMA_VERSION
    && typeof candidate.projectId === "string"
    && typeof candidate.recordingId === "string"
    && isPlainObject(candidate.summary)
    && isPlainObject(candidate.timeline)
    && isRecord(candidate.entries)
    && isRecord(candidate.actions)
    && isRecord(candidate.states)
    && isRecord(candidate.proposals);
}

export function validateRecordingIndex(index: RecordingIndex): RecordingStateIndexValidationIssue[] {
  const issues: RecordingStateIndexValidationIssue[] = [];
  if (index.schemaVersion !== RECORDING_STATE_INDEX_SCHEMA_VERSION) {
    issues.push(issue("invalid_schema_version", "schemaVersion", `Recording index schemaVersion must be ${RECORDING_STATE_INDEX_SCHEMA_VERSION}.`));
  }
  if (!index.projectId || !index.recordingId) {
    issues.push(issue("invalid_identity", "", "Recording index must include projectId and recordingId."));
  }
  if (!isFiniteNonNegative(index.summary.startedAt) || !isFiniteNonNegative(index.summary.updatedAt)) {
    issues.push(issue("invalid_summary", "summary", "Recording summary must include non-negative startedAt and updatedAt timestamps."));
  }

  for (const [entryId, entry] of sortedEntries(index.entries)) {
    if (entry.entryId !== entryId) issues.push(issue("entry_key_mismatch", `entries.${entryId}`, "Entry key must match entry.entryId."));
    if (entry.stateSnapshotId && !index.states[entry.stateSnapshotId]) {
      issues.push(issue("missing_state", `entries.${entryId}.stateSnapshotId`, `Entry references missing state snapshot ${entry.stateSnapshotId}.`));
    }
    if (entry.actionId && !index.actions[entry.actionId]) {
      issues.push(issue("missing_action", `entries.${entryId}.actionId`, `Entry references missing action ${entry.actionId}.`));
    }
    validateObjectRefs(index.projectId, entry.objectRefs ?? [], `entries.${entryId}.objectRefs`, issues);
  }

  for (const [actionId, action] of sortedEntries(index.actions)) {
    if (action.actionId !== actionId) issues.push(issue("action_key_mismatch", `actions.${actionId}`, "Action key must match action.actionId."));
    if (!index.entries[action.entryId]) issues.push(issue("missing_entry", `actions.${actionId}.entryId`, `Action references missing entry ${action.entryId}.`));
    for (const field of ["stateBeforeId", "stateAtActionId", "stateAfterId"] as const) {
      const stateSnapshotId = action[field];
      if (stateSnapshotId && !index.states[stateSnapshotId]) {
        issues.push(issue("missing_state", `actions.${actionId}.${field}`, `Action references missing state snapshot ${stateSnapshotId}.`));
      }
    }
    if (action.visualTarget) {
      validateActionVisualTargetIndexItem(index, actionId, action.visualTarget, issues);
    }
    validateObjectRefs(index.projectId, action.sourceObjectRefs ?? [], `actions.${actionId}.sourceObjectRefs`, issues);
  }

  for (const [stateSnapshotId, state] of sortedEntries(index.states)) {
    if (state.stateSnapshotId !== stateSnapshotId) issues.push(issue("state_key_mismatch", `states.${stateSnapshotId}`, "State key must match state.stateSnapshotId."));
    if (!index.entries[state.entryId]) issues.push(issue("missing_entry", `states.${stateSnapshotId}.entryId`, `State references missing entry ${state.entryId}.`));
    if (!state.stateRef) issues.push(issue("missing_state_ref", `states.${stateSnapshotId}.stateRef`, "State snapshot must include a stateRef object reference."));
    validateObjectRefs(index.projectId, [state.stateRef, ...(state.screenshotRef ? [state.screenshotRef] : []), ...(state.objectRefs ?? [])], `states.${stateSnapshotId}.objectRefs`, issues);
    for (const actionId of state.linkedActionIds ?? []) {
      if (!index.actions[actionId]) issues.push(issue("missing_action", `states.${stateSnapshotId}.linkedActionIds`, `State links missing action ${actionId}.`));
    }
  }

  for (const [proposalId, proposal] of sortedEntries(index.proposals)) {
    if (proposal.proposalId !== proposalId) issues.push(issue("proposal_key_mismatch", `proposals.${proposalId}`, "Proposal key must match proposal.proposalId."));
    if (proposal.recordingId !== index.recordingId) {
      issues.push(issue("proposal_recording_mismatch", `proposals.${proposalId}.recordingId`, "Proposal must belong to this recording index."));
    }
    for (const stateSnapshotId of proposal.stateSnapshotIds ?? []) {
      if (!index.states[stateSnapshotId]) issues.push(issue("missing_state", `proposals.${proposalId}.stateSnapshotIds`, `Proposal references missing state snapshot ${stateSnapshotId}.`));
    }
    validateObjectRefs(index.projectId, proposal.objectRefs ?? [], `proposals.${proposalId}.objectRefs`, issues);
  }

  return issues;
}

export function assertValidRecordingIndex(index: RecordingIndex): void {
  const issues = validateRecordingIndex(index);
  if (issues.length) {
    throw new Error(`Recording state index is invalid:\n${issues.map((item) => `- ${item.path}: ${item.message}`).join("\n")}`);
  }
}

export function recordingIndexStateObjectRefs(index: RecordingIndex): string[] {
  const refs = new Set<string>();
  for (const entry of Object.values(index.entries)) for (const ref of entry.objectRefs ?? []) refs.add(ref);
  for (const action of Object.values(index.actions)) for (const ref of action.sourceObjectRefs ?? []) refs.add(ref);
  for (const state of Object.values(index.states)) {
    refs.add(state.stateRef);
    if (state.screenshotRef) refs.add(state.screenshotRef);
    for (const ref of state.objectRefs ?? []) refs.add(ref);
  }
  for (const proposal of Object.values(index.proposals)) for (const ref of proposal.objectRefs ?? []) refs.add(ref);
  return [...refs].sort();
}

export function sortRecordingIndex(index: RecordingIndex): RecordingIndex {
  return {
    ...index,
    entries: sortRecord(index.entries),
    actions: sortRecord(index.actions),
    states: sortRecord(index.states),
    proposals: sortRecord(index.proposals)
  };
}

export function recordingActionVisualTargetIndexItem(target: ActionVisualEntityTarget | undefined): RecordingActionVisualTargetIndexItem | undefined {
  if (!target) return undefined;
  return compactObject({
    entityId: target.entityId,
    entityKind: target.entityKind,
    statePath: target.statePath,
    stateSnapshotId: target.stateSnapshotId,
    visualFrameId: target.visualFrameId,
    visualLayerId: target.visualLayerId,
    confidence: target.confidence
  });
}

function validateObjectRefs(projectId: string, refs: string[], path: string, issues: RecordingStateIndexValidationIssue[]): void {
  for (const ref of refs) {
    const parsed = parseAutomationStudioObjectContentRef(ref);
    if (!parsed) {
      issues.push(issue("invalid_object_ref", path, `Object reference is not an Automation Studio content ref: ${ref}`));
      continue;
    }
    if (parsed.projectId !== projectId) {
      issues.push(issue("cross_project_ref", path, `Object reference points to project ${parsed.projectId}, expected ${projectId}.`));
    }
  }
}

function validateActionVisualTargetIndexItem(index: RecordingIndex, actionId: string, target: RecordingActionVisualTargetIndexItem, issues: RecordingStateIndexValidationIssue[]): void {
  const path = `actions.${actionId}.visualTarget`;
  if (target.stateSnapshotId && !index.states[target.stateSnapshotId]) {
    issues.push(issue("missing_state", `${path}.stateSnapshotId`, `Action visual target references missing state snapshot ${target.stateSnapshotId}.`));
  }
  if (target.statePath && (!target.statePath.namespace.trim() || !target.statePath.path.trim())) {
    issues.push(issue("invalid_summary", `${path}.statePath`, "Action visual target statePath must include namespace and path."));
  }
  if (target.confidence !== undefined && (target.confidence < 0 || target.confidence > 1)) {
    issues.push(issue("invalid_summary", `${path}.confidence`, "Action visual target confidence must be between 0 and 1."));
  }
}

function issue(code: RecordingStateIndexValidationIssue["code"], path: string, message: string): RecordingStateIndexValidationIssue {
  return { code, path, message };
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isRecord(value: unknown): value is Record<string, JsonObject> {
  return isPlainObject(value);
}

function sortedEntries<T>(record: Record<string, T>): Array<[string, T]> {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(sortedEntries(record));
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
