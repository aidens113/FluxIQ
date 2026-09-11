import type { JsonObject } from "../../../../../core/index.ts";
import { safeSegment } from "../../../../_shared/storage.ts";
import type { StateDelta, StateElementDescriptor, StateElementKind, StateValue } from "../../../model/index.ts";
import type { EvidenceClaim, EvidenceFact, EvidenceObservation, StateActionCorrelation } from "../../../mining/index.ts";
import type { NormalizedTimeline } from "../../../normalization/index.ts";
import { uniqueStrings } from "../collections.ts";
import { compactJsonObject } from "../compact-json.ts";
import { formatStatePath, readableStatePath } from "./text.ts";
import { descriptorForStateValue, isValuableStateElement, prioritizedStateValuesForAction } from "./state-elements.ts";

// State observed around a recorded action, and the claims drawn from it: what
// was already true before the action, what changed after it, and how much
// weight a single recording earns.
const MAX_PRE_ACTION_STATE_CORRELATIONS = 12;
const MAX_POST_ACTION_STATE_DELTAS = 12;

export function createStateActionCorrelations(
  miningRunId: string,
  timeline: NormalizedTimeline,
  actions: NormalizedTimeline["timeline"],
  descriptors: Map<string, StateElementDescriptor>
): StateActionCorrelation[] {
  const correlations: StateActionCorrelation[] = [];
  const checkpoints = timeline.timeline.filter((entry) => entry.type === "state_checkpoint");
  const stateDeltas = timeline.timeline.filter((entry) => entry.type === "state_delta");
  actions.forEach((action, actionIndex) => {
    const previousAction = actions[actionIndex - 1];
    const nextAction = actions[actionIndex + 1];
    const windowStartOffsetMs = previousAction?.monotonicOffsetMs ?? 0;
    const windowEndOffsetMs = nextAction?.monotonicOffsetMs ?? timeline.timeline[timeline.timeline.length - 1]?.monotonicOffsetMs ?? action.monotonicOffsetMs;
    const previousCheckpoint = [...checkpoints].reverse().find((checkpoint) => checkpoint.monotonicOffsetMs <= action.monotonicOffsetMs);
    if (previousCheckpoint?.type === "state_checkpoint") {
      let index = 0;
      for (const [statePath, stateValue] of prioritizedStateValuesForAction(previousCheckpoint.state, descriptors, MAX_PRE_ACTION_STATE_CORRELATIONS)) {
        const descriptor = descriptorForStateValue(statePath, stateValue, descriptors);
        correlations.push({
          schemaVersion: "0.1",
          correlationId: `corr.${safeSegment(timeline.recordingId)}.${safeSegment(action.id)}.before.${index + 1}`,
          miningRunId,
          recordingId: timeline.recordingId,
          normalizedTimelineId: timeline.normalizedTimelineId,
          actionEntryId: action.id,
          statePath,
          relation: descriptor.kind === "enabled" && stateValue.value === true ? "became_enabled_before_action" : "present_before_action",
          elementKind: descriptor.kind,
          descriptor,
          before: stateValueToJson(stateValue),
          timing: {
            beforeMs: Math.max(0, action.monotonicOffsetMs - previousCheckpoint.monotonicOffsetMs),
            windowStartOffsetMs,
            actionOffsetMs: action.monotonicOffsetMs,
            windowEndOffsetMs
          },
          support: [
            { layer: "normalized_timeline", artifactId: timeline.normalizedTimelineId, entryId: previousCheckpoint.id, signalPath: statePath },
            { layer: "normalized_timeline", artifactId: timeline.normalizedTimelineId, entryId: action.id }
          ]
        });
        index += 1;
      }
    }
    for (const deltaEntry of stateDeltas.filter((entry) => entry.monotonicOffsetMs >= action.monotonicOffsetMs && entry.monotonicOffsetMs <= windowEndOffsetMs).slice(0, MAX_POST_ACTION_STATE_DELTAS)) {
      if (deltaEntry.type !== "state_delta") continue;
      deltaEntry.deltas.forEach((delta, deltaIndex) => {
        const statePath = formatStatePath(delta.namespace, delta.path);
        const stateValue = delta.current ?? delta.previous;
        if (!stateValue || !isValuableStateElement(statePath, stateValue, descriptors)) return;
        const descriptor = descriptorForStateValue(statePath, stateValue, descriptors);
        correlations.push({
          schemaVersion: "0.1",
          correlationId: `corr.${safeSegment(timeline.recordingId)}.${safeSegment(action.id)}.after.${safeSegment(deltaEntry.id)}.${safeSegment(statePath)}.${deltaIndex + 1}`,
          miningRunId,
          recordingId: timeline.recordingId,
          normalizedTimelineId: timeline.normalizedTimelineId,
          actionEntryId: action.id,
          statePath,
          relation: correlationRelationForDelta(delta, descriptor.kind),
          elementKind: descriptor.kind,
          descriptor,
          ...(delta.previous ? { before: stateValueToJson(delta.previous) } : {}),
          ...(delta.current ? { after: stateValueToJson(delta.current) } : {}),
          timing: {
            afterMs: Math.max(0, deltaEntry.monotonicOffsetMs - action.monotonicOffsetMs),
            windowStartOffsetMs,
            actionOffsetMs: action.monotonicOffsetMs,
            windowEndOffsetMs
          },
          support: [
            { layer: "normalized_timeline", artifactId: timeline.normalizedTimelineId, entryId: action.id },
            { layer: "normalized_timeline", artifactId: timeline.normalizedTimelineId, entryId: deltaEntry.id, signalPath: statePath }
          ]
        });
      });
    }
  });
  return correlations;
}

export function correlationRelationForDelta(delta: StateDelta, kind: StateElementKind): StateActionCorrelation["relation"] {
  if (delta.change === "added") return "appeared_after_action";
  if (delta.change === "removed") return "disappeared_after_action";
  if (kind === "visibility" && delta.current?.value === true) return "became_visible_after_action";
  return "changed_after_action";
}

export function stateValueToJson(value: StateValue): JsonObject {
  return compactJsonObject({
    type: value.type,
    value: value.value,
    observedAt: value.observedAt,
    ...(value.sourceId !== undefined ? { sourceId: value.sourceId } : {}),
    ...(value.volatility !== undefined ? { volatility: value.volatility } : {}),
    ...(value.semanticRole !== undefined ? { semanticRole: value.semanticRole } : {}),
    ...(value.metadata !== undefined ? { metadata: value.metadata } : {})
  });
}

export function confidenceForCorrelation(correlation: StateActionCorrelation): number {
  if (correlation.relation === "changed_after_action" || correlation.relation === "appeared_after_action" || correlation.relation === "became_visible_after_action") return 0.68;
  if (correlation.elementKind === "static_id" || correlation.elementKind === "selector" || correlation.elementKind === "label" || correlation.elementKind === "text") return 0.58;
  return 0.5;
}

export function createCorrelationClaim(
  miningRunId: string,
  timeline: NormalizedTimeline,
  correlation: StateActionCorrelation,
  index: number,
  observations: EvidenceObservation[]
): EvidenceClaim {
  const relatedObservations = observations.filter((observation) => observation.subject?.statePath === correlation.statePath || observation.factIds.some((factId) => correlation.support.some((evidence) => evidence.artifactId === factId)));
  const isAfter = correlation.relation.includes("after") || correlation.relation === "changed_between_actions";
  const label = correlation.descriptor?.label ?? readableStatePath(correlation.statePath);
  return {
    schemaVersion: "0.1",
    claimId: `claim.${safeSegment(timeline.recordingId)}.correlation.${index + 1}`,
    miningRunId,
    recordingId: timeline.recordingId,
    normalizedTimelineId: timeline.normalizedTimelineId,
    claimType: isAfter ? "action_effect" : "candidate_condition",
    title: isAfter ? `${label} changed after action` : `${label} was present before action`,
    summary: isAfter
      ? `${label} ${correlation.relation.replace(/_/g, " ")} within ${correlation.timing.afterMs ?? 0}ms after the action.`
      : `${label} was observed before the action and may identify context, readiness, or the action target.`,
    observationIds: relatedObservations.map((observation) => observation.observationId),
    factIds: uniqueStrings(relatedObservations.flatMap((observation) => observation.factIds)),
    statement: {
      subject: { kind: "action", entryId: correlation.actionEntryId },
      relationship: correlation.relation,
      object: { kind: "state_element", signalPath: correlation.statePath, elementKind: correlation.elementKind }
    },
    confidence: { score: confidenceForCorrelation(correlation), basis: "Inferred from state timing around a recorded action.", sampleSize: 1 },
    sourceEvidence: [{ layer: "state_action_correlation", artifactId: correlation.correlationId, relationship: correlation.relation }, ...correlation.support],
    metadata: { correlationId: correlation.correlationId }
  };
}

export function createTransitionClaims(
  miningRunId: string,
  timeline: NormalizedTimeline,
  actions: NormalizedTimeline["timeline"],
  factsByEntryId: Map<string, EvidenceFact>,
  observationsByFactId: Map<string, EvidenceObservation[]>
): EvidenceClaim[] {
  return actions.slice(0, -1).map((entry, index) => {
    const next = actions[index + 1]!;
    const currentFact = factsByEntryId.get(entry.id);
    const nextFact = factsByEntryId.get(next.id);
    const currentObservation = currentFact ? observationsByFactId.get(currentFact.factId)?.[0] : undefined;
    const nextObservation = nextFact ? observationsByFactId.get(nextFact.factId)?.[0] : undefined;
    const gapMs = Math.max(0, next.monotonicOffsetMs - entry.monotonicOffsetMs);
    return {
      schemaVersion: "0.1",
      claimId: `claim.${safeSegment(timeline.recordingId)}.transition.${index + 1}`,
      miningRunId,
      recordingId: timeline.recordingId,
      normalizedTimelineId: timeline.normalizedTimelineId,
      claimType: gapMs >= 250 ? "wait" : "transition",
      title: gapMs >= 250 ? `Waited ${gapMs}ms before ${nextObservation?.title ?? next.id}` : `${currentObservation?.title ?? entry.id} led to ${nextObservation?.title ?? next.id}`,
      summary: `${nextObservation?.title ?? "Next action"} occurred ${gapMs}ms after ${currentObservation?.title ?? "the previous action"}.`,
      observationIds: uniqueStrings([currentObservation?.observationId ?? "", nextObservation?.observationId ?? ""]),
      factIds: uniqueStrings([currentFact?.factId ?? "", nextFact?.factId ?? ""]),
      statement: {
        subject: { kind: "observation", observationId: currentObservation?.observationId ?? null },
        relationship: gapMs >= 250 ? "followed_after_wait" : "followed_by",
        object: { kind: "observation", observationId: nextObservation?.observationId ?? null, waitMs: gapMs }
      },
      confidence: { score: 0.6, basis: "Observed ordering within one recording.", sampleSize: 1 },
      sourceEvidence: [
        { layer: "normalized_timeline", artifactId: timeline.normalizedTimelineId, entryId: entry.id },
        { layer: "normalized_timeline", artifactId: timeline.normalizedTimelineId, entryId: next.id }
      ]
    };
  });
}
