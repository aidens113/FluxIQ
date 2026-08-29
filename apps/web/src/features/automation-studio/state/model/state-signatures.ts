import type { EvidenceAnchor, EvidenceReference, NodeEvidenceBinding, NodeEvidenceRole, NodeStatePhase, NodeStateRuntimeComparison, NodeStateSource, StateFact, StateSnapshot, StateValue, StateVisualFrame } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../../shared/selection-contracts";
import type { BuildNodeStateViewModelInput, NodeEvidenceBindingViewModel, NodeStateRuntimeComparisonRow, NodeStateRuntimeComparisonViewModel, NodeStateViewModel, ResolvedActionVisualTargetViewModel, StateDiffRow, StateFactViewModel, StateOverlayTone, StateOverlayViewModel, StateSourceRecord, StateStructuredRow, StateVisualTone } from "./types";
import { arrayValue, objectRecord } from "./value-utils";

type StateSignatureObject = Record<string, unknown>;

export function buildNodeStateInputSignature(input: BuildNodeStateViewModelInput): string {
  return [
    `selection:${selectionSignature(input.selection)}`,
    `node:${objectIdentitySignature(input.selectedNode, ["id", "nodeId", "flowId"], ["updatedAt", "revision", "version"])}`,
    `entry:${objectIdentitySignature(input.selectedEntry, ["id", "entryId", "timelineEntryId"], ["timestamp", "updatedAt", "stateSnapshotId"])}`,
    `proposal:${objectIdentitySignature(input.selectedProposal, ["proposalId", "id"], ["updatedAt", "createdAt", "status"])}`,
    `recording:${objectIdentitySignature(input.selectedRecording, ["recordingId", "id"], ["updatedAt", "finalizedAt", "status"])}`,
    `timeline:${objectIdentitySignature(input.selectedTimeline, ["recordingId", "timelineId", "id"], ["updatedAt", "finalizedAt", "status"])}`,
    `policy:${objectIdentitySignature(input.policy, ["policyId", "id", "flowId"], ["updatedAt", "version", "revision"])}`,
    `taskGraph:${objectIdentitySignature(input.taskGraph, ["flowId", "id"], ["updatedAt", "version", "revision"])}`,
    `artifacts:${objectIdentitySignature(input.pipelineArtifacts, ["artifactId", "id", "projectId"], ["updatedAt", "version", "revision"])}`,
    `recordings:${collectionIdentitySignature(input.recordings, ["recordingId", "id"], ["updatedAt", "finalizedAt", "status"])}`,
    `timelines:${collectionIdentitySignature(input.timelines, ["recordingId", "timelineId", "id"], ["updatedAt", "finalizedAt", "status"])}`,
    `runtime:${collectionIdentitySignature(input.runtimeSessions, ["runId", "sessionId", "id"], ["updatedAt", "finishedAt", "status"])}`,
    `signals:${collectionIdentitySignature(input.signals, ["signalId", "id", "name"], ["updatedAt", "version", "revision"])}`,
    `indexed:${indexedStateSourcesSignature(input.indexedStateSources ?? [])}`,
    `view:${buildNodeStateViewStateSignature(input.viewState)}`
  ].join("\u001f");
}

export function buildNodeStateViewStateSignature(viewState: BuildNodeStateViewModelInput["viewState"] | undefined): string {
  if (!viewState) return "";
  return [viewState.sourceId ?? "", viewState.stateSnapshotId ?? "", viewState.phase ?? "", viewState.selectedEvidenceId ?? "", viewState.selectedFactPath ?? ""].join("\u001e");
}

export function selectionSignature(selection: AutomationSelection | null): string {
  if (!selection) return "";
  return [
    selection.kind,
    selection.id,
    "nodeId" in selection ? selection.nodeId ?? "" : "",
    "sourceId" in selection ? selection.sourceId ?? "" : "",
    "stateSnapshotId" in selection ? selection.stateSnapshotId ?? "" : "",
    "timelineEntryId" in selection ? selection.timelineEntryId ?? "" : "",
    "recordingId" in selection ? selection.recordingId ?? "" : "",
    "proposalId" in selection ? selection.proposalId ?? "" : "",
    "phase" in selection ? selection.phase ?? "" : "",
    "evidenceId" in selection ? selection.evidenceId ?? "" : "",
    "factPath" in selection ? selection.factPath ?? "" : ""
  ].join("\u001e");
}

export function collectionIdentitySignature(values: unknown[] | undefined, idKeys: string[], revisionKeys: string[]): string {
  const records = arrayValue(values);
  if (!records.length) return "0";
  return `${records.length}:${records.map((item, index) => objectIdentitySignature(item, idKeys, revisionKeys, index)).join("\u001d")}`;
}

export function objectIdentitySignature(value: unknown, idKeys: string[], revisionKeys: string[], fallbackIndex?: number): string {
  const record = objectRecord(value);
  if (!record) return fallbackIndex === undefined ? "" : String(fallbackIndex);
  const id = firstSignatureValue(record, idKeys) ?? (fallbackIndex === undefined ? "" : String(fallbackIndex));
  const revisions = revisionKeys.map((key) => signaturePrimitive(record[key])).join("~");
  const counts = ["nodes", "edges", "timeline", "entries", "nodeEvidenceBindings", "runtimeSessions", "learnedTaskModels", "recordingSessions", "normalizedTimelines", "policyProposals"].map((key) => arrayCountSignature(record, key)).filter(Boolean).join("~");
  const nested = [
    nestedIdSignature(record, ["node"], ["id", "nodeId"], ["updatedAt", "revision", "version"]),
    nestedIdSignature(record, ["metadata"], ["stateSnapshotId", "timelineEntryId", "recordingId", "nodeId"], ["updatedAt", "revision", "version"])
  ].filter(Boolean).join("~");
  return [id, revisions, counts, nested].filter(Boolean).join("~");
}

export function indexedStateSourcesSignature(values: NonNullable<BuildNodeStateViewModelInput["indexedStateSources"]>): string {
  if (!values.length) return "0";
  return `${values.length}:${values.map((item, index) => {
    const source = item.source as unknown as StateSignatureObject;
    const snapshot = item.snapshot as unknown as StateSignatureObject;
    return [
      signaturePrimitive(source.id) || String(index),
      signaturePrimitive(source.kind),
      signaturePrimitive(source.timestamp),
      signaturePrimitive(source.stateSnapshotId),
      signaturePrimitive(snapshot.id),
      signaturePrimitive(snapshot.timestamp),
      stateSnapshotShapeSignature(item.snapshot)
    ].join("~");
  }).join("\u001d")}`;
}

export function stateSnapshotShapeSignature(snapshot: StateSnapshot): string {
  const namespaces = objectRecord(snapshot.namespaces);
  if (!namespaces) return "0";
  const snapshotPresentation = objectRecord(snapshot.presentation);
  const frameCount = arrayValue(snapshotPresentation?.visualFrames).length;
  return Object.entries(namespaces).map(([namespace, value]) => {
    const values = objectRecord(objectRecord(value)?.values);
    return `${namespace}:${values ? Object.keys(values).length : 0}`;
  }).join("~") + `:frames:${frameCount}`;
}

export function nestedIdSignature(record: StateSignatureObject, path: string[], idKeys: string[], revisionKeys: string[]): string {
  let current: unknown = record;
  for (const key of path) current = objectRecord(current)?.[key];
  return objectIdentitySignature(current, idKeys, revisionKeys);
}

export function arrayCountSignature(record: StateSignatureObject, key: string): string {
  const value = record[key];
  return Array.isArray(value) ? `${key}:${value.length}` : "";
}

export function firstSignatureValue(record: StateSignatureObject, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = signaturePrimitive(record[key]);
    if (value) return value;
  }
  return undefined;
}

export function signaturePrimitive(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}
