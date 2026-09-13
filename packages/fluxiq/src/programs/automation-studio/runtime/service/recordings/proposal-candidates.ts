import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import type { IoRegistry } from "../../../../../io/index.ts";
import { safeSegment } from "../../../../_shared/storage.ts";
import { normalizeAutomationStudioElementTarget, type AutomationStudioFlowArtifact, type RecordingSession } from "../../../model/index.ts";
import type { AutomationStudioRecordingMapperCandidate, AutomationStudioRecordingMapperObservation } from "../../../nodes/index.ts";
import type { RecordingFlowActionCandidate, RecordingFlowProposalArtifact } from "../../recording-flow-proposal.ts";
import { uniqueStrings } from "../collections.ts";
import { compactJsonObject } from "../compact-json.ts";

// A recording's way to a Flow: the calls a recording mapper receives, the
// proposal candidate each thing it proposes becomes, and the recorded action
// node an approved candidate becomes.

// How many of the entries after an observation a mapper is shown: enough to read
// what an action led to without handing every call the rest of the recording.
const FOLLOWING_OBSERVATION_LIMIT = 32;

type RecordingMapperCall = { observation: AutomationStudioRecordingMapperObservation; following: AutomationStudioRecordingMapperObservation[] };

/**
 * One call for each mapper-visible entry: its observation, and the observations
 * of the entries after it in timeline order, at most 32. Build it once for each
 * mapper, so one mapper's changes to what it was handed never reach another.
 * Within one mapper's calls, an observation in `following` is the same object
 * that mapper is later handed for that entry.
 */
export function recordingMapperCalls(timeline: RecordingSession["timeline"], recordingId: string, domainId: string): RecordingMapperCall[] {
  const observations = timeline.map((entry): AutomationStudioRecordingMapperObservation => ({
    observationId: entry.id,
    recordingId,
    domainId,
    type: entry.type,
    timestamp: entry.timestamp,
    payload: recordingEntryPayload(entry),
    metadata: { ...(entry.metadata ?? {}) }
  }));
  return observations.map((observation, index) => ({ observation, following: observations.slice(index + 1, index + 1 + FOLLOWING_OBSERVATION_LIMIT) }));
}

/**
 * Checks one mapper candidate against the bound IO registry and gives it the
 * shape a proposal stores. Its `expectedState` is kept, as a clone, only when it
 * is a plain object; anything else is dropped and the action is still proposed.
 */
export function recordingFlowActionCandidate(io: IoRegistry, input: { candidate: AutomationStudioRecordingMapperCandidate; actionEntryId: string; sourceEntryId: string; recordingId: string; domainId: string; stateLink?: RecordingFlowActionCandidate["stateLink"]; mapperOutputIds?: string[] }): RecordingFlowActionCandidate {
  const outputId = input.candidate.outputId?.trim();
  if (!outputId) throw new Error("Recording mapper candidates must declare an outputId.");
  if (input.mapperOutputIds?.length && !input.mapperOutputIds.includes(outputId)) throw new Error(`Recording mapper emitted undeclared output ${outputId}.`);
  if (!io.hasOutput(input.domainId, outputId)) throw new Error(`Recording mapper emitted unregistered output ${outputId}.`);
  const sourceInputIds = uniqueStrings(input.candidate.sourceInputIds ?? []);
  for (const inputId of sourceInputIds) {
    const adapter = io.getInput(input.domainId, inputId);
    if (!adapter) throw new Error(`Recording mapper referenced unregistered input ${inputId}.`);
    if ((adapter.definition.role ?? "state") !== "action") throw new Error(`Recording mapper source input ${inputId} is state-eligible and cannot be reclassified as an action.`);
  }
  const confirmation = input.candidate.expectedConfirmation;
  if (confirmation) {
    const adapter = io.getInput(input.domainId, confirmation.inputId);
    if (!adapter) throw new Error(`Recording mapper referenced unregistered confirmation input ${confirmation.inputId}.`);
    if ((adapter.definition.role ?? "state") !== "action") throw new Error(`Confirmation input ${confirmation.inputId} must be an action-role observation.`);
  }
  const sourceObservationIds = uniqueStrings([input.sourceEntryId, input.actionEntryId, ...(input.candidate.sourceObservationIds ?? [])]);
  const parameters = normalizeRecordingCandidateElementTargetParameters(input.candidate.parameters ?? {});
  const expectedState = liftedExpectedState(input.candidate.expectedState);
  return {
    candidateId: `candidate.${safeSegment(input.actionEntryId)}.${randomUUID()}`,
    actionEntryId: input.actionEntryId,
    sourceObservationIds,
    sourceInputIds,
    outputId,
    parameters,
    ...(confirmation ? { expectedConfirmation: { ...confirmation } } : {}),
    ...(expectedState ? { expectedState } : {}),
    confidence: clampConfidence(input.candidate.confidence),
    evidence: input.candidate.evidence?.length ? structuredClone(input.candidate.evidence) : sourceObservationIds.map((entryId) => ({ layer: "recording" as const, artifactId: input.recordingId, entryId })),
    ...(input.stateLink ? { stateLink: input.stateLink } : {}),
    policyStateEligible: false,
    ...(input.candidate.label ? { label: input.candidate.label } : {}),
    ...(input.candidate.description ? { description: input.candidate.description } : {})
  };
}

/**
 * Appends an approved proposal's candidates to a Flow as recorded action nodes
 * joined by success edges. A candidate's `expectedState` becomes the node's
 * `parameterValues.expectedState`, where the transition comparison reads it.
 */
export function appendRecordingProposalToFlow(flow: AutomationStudioFlowArtifact, proposal: RecordingFlowProposalArtifact): AutomationStudioFlowArtifact {
  const nodeIds = new Set(flow.nodes.map((node) => node.id));
  const nodes = proposal.candidates.map((candidate, index) => {
    let id = `recorded.${safeSegment(candidate.candidateId)}`;
    let suffix = 2;
    while (nodeIds.has(id)) id = `recorded.${safeSegment(candidate.candidateId)}.${suffix++}`;
    nodeIds.add(id);
    return {
      id,
      definitionId: "builtin.policy.action",
      label: candidate.label ?? candidate.outputId,
      ...(candidate.description ? { description: candidate.description } : {}),
      parameterValues: compactJsonObject({
        outputId: candidate.outputId,
        parameters: structuredClone(candidate.parameters),
        ...(candidate.expectedConfirmation ? { confirmationInputId: candidate.expectedConfirmation.inputId, confirmationTimeoutMs: candidate.expectedConfirmation.timeoutMs ?? 5_000 } : {}),
        expectedState: candidate.expectedState ? structuredClone(candidate.expectedState) : undefined
      }),
      position: { x: 120 + index * 340, y: 240 },
      metadata: {
        recordingProposalId: proposal.proposalId,
        recordingCandidateId: candidate.candidateId,
        mapperId: proposal.mapper.id,
        mapperVersion: proposal.mapper.version,
        actionEntryId: candidate.actionEntryId,
        timelineEntryId: candidate.actionEntryId,
        ...recordingCandidateStateLinkMetadata(candidate),
        sourceObservationIds: candidate.sourceObservationIds,
        evidence: candidate.evidence,
        rawEvidenceImmutable: true,
        manualProvenance: []
      }
    };
  });
  const edges = nodes.slice(1).map((node, index) => ({
    id: `recorded-edge.${safeSegment(proposal.proposalId)}.${index + 1}`,
    sourceNodeId: nodes[index]!.id,
    targetNodeId: node.id,
    sourcePortId: "success",
    targetPortId: "ready",
    metadata: { recordingProposalId: proposal.proposalId }
  }));
  return { ...flow, nodes: [...flow.nodes, ...nodes], edges: [...flow.edges, ...edges], metadata: { ...(flow.metadata ?? {}), recordingProposalIds: uniqueStrings([...(Array.isArray(flow.metadata?.recordingProposalIds) ? flow.metadata.recordingProposalIds.map(String) : []), proposal.proposalId]) } };
}

/** The state link a candidate carries, as the metadata fields a recorded node or definition stores. */
export function recordingCandidateStateLinkMetadata(candidate: RecordingFlowActionCandidate): JsonObject {
  return candidate.stateLink ? compactJsonObject({
    stateLink: candidate.stateLink as unknown as JsonObject,
    stateSnapshotId: candidate.stateLink.stateSnapshotId,
    stateRef: candidate.stateLink.stateRef,
    screenshotRef: candidate.stateLink.screenshotRef
  }) : {};
}

// A mapper runs in-process and can hand Core anything. Only a plain object is an
// expected state. It is cloned, so the proposal holds nothing the mapper can
// still change, and one that cannot be cloned is dropped like any other value.
function liftedExpectedState(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  try {
    return structuredClone(value) as JsonObject;
  } catch {
    return undefined;
  }
}

function normalizeRecordingCandidateElementTargetParameters(parameters: JsonObject): JsonObject {
  const target = normalizeAutomationStudioElementTarget(parameters.element ? parameters : parameters.target, { source: "mapper" }) ?? normalizeAutomationStudioElementTarget(parameters, { source: "mapper" });
  if (!target) return { ...parameters };
  return compactJsonObject({ ...parameters, target });
}

function recordingEntryPayload(entry: RecordingSession["timeline"][number]): JsonObject {
  const { id: _id, recordingId: _recordingId, timestamp: _timestamp, monotonicOffsetMs: _offset, sequence: _sequence, sourceId: _sourceId, metadata: _metadata, ...payload } = entry;
  return structuredClone(payload) as unknown as JsonObject;
}

function clampConfidence(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}
