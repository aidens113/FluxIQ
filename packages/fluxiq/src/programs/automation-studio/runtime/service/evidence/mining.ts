import type { JsonObject } from "../../../../../core/index.ts";
import { safeSegment } from "../../../../_shared/storage.ts";
import type { RecordingDomainRegistry } from "../../../model/index.ts";
import type { EvidenceObservation, SignalMiningResult } from "../../../mining/index.ts";
import type { CanonicalAutomationStudioRepositories } from "../../../storage/index.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";
import type { AutomationStudioRecordingStore } from "../recordings/index.ts";
import { createEvidenceFact, createEvidenceObservations } from "./facts.ts";
import { confidenceForCorrelation, createCorrelationClaim, createStateActionCorrelations, createTransitionClaims } from "./correlations.ts";
import { stateElementDescriptorsForTimeline } from "./state-elements.ts";
import { formatStatePath } from "./text.ts";

function uniqueBy<T>(values: T[], keyFor: (value: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const value of values) {
    const key = keyFor(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

// Signal mining over one normalized timeline: facts, observations, state to
// action correlations, and the claims and candidate conditions drawn from
// them, written back as the recording's mining run.
export class AutomationStudioEvidenceMining {
  constructor(
    private readonly recordingDomains: RecordingDomainRegistry,
    private readonly recordings: AutomationStudioRecordingStore,
    private readonly repositories: CanonicalAutomationStudioRepositories,
    private readonly facade: AutomationStudioFacadePorts
  ) {}

  async mineRecordingEvidence(input: { projectId: string; normalizedTimelineId?: string; recordingId?: string }): Promise<SignalMiningResult> {
    const timeline = input.normalizedTimelineId
      ? (await this.repositories.normalizedTimelines.get(input.normalizedTimelineId))
      : (await this.facade.listProjectNormalizedTimelines(input.projectId)).find((item) => item.recordingId === input.recordingId);
    if (!timeline) throw new Error("Normalized timeline is required before mining.");
    const miningRunId = `mining.${safeSegment(timeline.normalizedTimelineId)}.${Date.now()}`;
    const actions = timeline.timeline.filter((entry) => entry.type === "action" || entry.type === "domain_event");
    const deltas = timeline.timeline.filter((entry) => entry.type === "state_delta");
    const facts = timeline.timeline.map((entry) => createEvidenceFact(miningRunId, timeline, entry, this.recordingDomains.get(String(entry.metadata?.domainId ?? ""))));
    const factsByEntryId = new Map(facts.map((fact) => [String(fact.source.entryId ?? ""), fact]));
    const observations = facts.flatMap((fact) => createEvidenceObservations(fact));
    const observationsByFactId = new Map<string, EvidenceObservation[]>();
    for (const observation of observations) {
      for (const factId of observation.factIds) {
        observationsByFactId.set(factId, [...(observationsByFactId.get(factId) ?? []), observation]);
      }
    }
    const descriptors = stateElementDescriptorsForTimeline(timeline, this.recordingDomains.list());
    const correlations = createStateActionCorrelations(miningRunId, timeline, actions, descriptors);
    const windows = actions.map((entry, index) => ({
      id: `window.${entry.id}`,
      kind: "immediate_post_action" as const,
      actionEntryId: entry.id,
      startOffsetMs: entry.monotonicOffsetMs,
      endOffsetMs: actions[index + 1]?.monotonicOffsetMs ?? timeline.timeline[timeline.timeline.length - 1]?.monotonicOffsetMs ?? entry.monotonicOffsetMs,
      sourceEvidence: [{ layer: "normalized_timeline" as const, artifactId: timeline.normalizedTimelineId, entryId: entry.id }]
    }));
    const correlationEffects = correlations
      .filter((correlation) => correlation.relation.includes("after") || correlation.relation === "changed_between_actions")
      .map((correlation) => ({
        actionOccurrenceId: correlation.actionEntryId,
        signalPath: correlation.statePath,
        relationship: "likely_effect" as const,
        probability: confidenceForCorrelation(correlation),
        delayMs: {
          min: correlation.timing.afterMs ?? 0,
          median: correlation.timing.afterMs ?? 0,
          max: correlation.timing.afterMs ?? 0
        },
        evidence: [{ layer: "state_action_correlation" as const, artifactId: correlation.correlationId, signalPath: correlation.statePath, relationship: correlation.relation }]
      }));
    const rawDeltaEffects = actions.flatMap((action) => deltas
      .filter((delta) => delta.monotonicOffsetMs >= action.monotonicOffsetMs)
      .slice(0, 3)
      .flatMap((delta) => (delta as any).deltas?.map((stateDelta: any) => ({
        actionOccurrenceId: action.id,
        signalPath: formatStatePath(stateDelta.namespace, stateDelta.path),
        relationship: "possible_effect" as const,
        probability: 0.55,
        delayMs: { min: Math.max(0, delta.monotonicOffsetMs - action.monotonicOffsetMs), median: Math.max(0, delta.monotonicOffsetMs - action.monotonicOffsetMs), max: Math.max(0, delta.monotonicOffsetMs - action.monotonicOffsetMs) },
        evidence: [{ layer: "normalized_timeline" as const, artifactId: timeline.normalizedTimelineId, entryId: delta.id, signalPath: formatStatePath(stateDelta.namespace, stateDelta.path) }]
      })) ?? []));
    const actionEffects = uniqueBy([...correlationEffects, ...rawDeltaEffects], (effect) => `${effect.actionOccurrenceId}:${effect.signalPath}:${effect.relationship}`);
    const conditionCandidates = correlations
      .filter((correlation) => !correlation.relation.includes("after") && correlation.relation !== "changed_between_actions")
      .map((correlation) => ({
        signalPath: correlation.statePath,
        role: correlation.relation === "became_enabled_before_action" ? "eligibility_signal" as const : "context_signal" as const,
        probability: confidenceForCorrelation(correlation),
        evidence: [{ layer: "state_action_correlation" as const, artifactId: correlation.correlationId, signalPath: correlation.statePath, relationship: correlation.relation }],
        metadata: { actionEntryId: correlation.actionEntryId, relation: correlation.relation }
      }));
    const claims = [
      ...correlations.map((correlation, index) => createCorrelationClaim(miningRunId, timeline, correlation, index, observations)),
      ...createTransitionClaims(miningRunId, timeline, actions, factsByEntryId, observationsByFactId)
    ];
    const result: SignalMiningResult = {
      schemaVersion: "0.1",
      miningRunId,
      normalizedTimelineId: timeline.normalizedTimelineId,
      evidenceFactIds: facts.map((fact) => fact.factId),
      evidenceObservationIds: observations.map((observation) => observation.observationId),
      stateActionCorrelationIds: correlations.map((correlation) => correlation.correlationId),
      evidenceClaimIds: claims.map((claim) => claim.claimId),
      facts,
      observations,
      correlations,
      claims,
      windows,
      actionEffects,
      conditionCandidates,
      issues: actions.length ? [] : ["No action/domain events were available to mine."],
      generatedAt: Date.now(),
      metadata: {
        recordingId: timeline.recordingId,
        ...(timeline.taskId !== undefined ? { taskId: timeline.taskId } : {})
      }
    };
    await this.recordings.writePipelineArtifacts(input.projectId, [
      ...facts.map((fact) => ({ kind: "evidenceFacts" as const, id: fact.factId, artifact: fact as unknown as JsonObject })),
      ...observations.map((observation) => ({ kind: "evidenceObservations" as const, id: observation.observationId, artifact: observation as unknown as JsonObject })),
      ...correlations.map((correlation) => ({ kind: "stateActionCorrelations" as const, id: correlation.correlationId, artifact: correlation as unknown as JsonObject })),
      ...claims.map((claim) => ({ kind: "evidenceClaims" as const, id: claim.claimId, artifact: claim as unknown as JsonObject })),
      { kind: "miningRuns" as const, id: result.miningRunId, artifact: result as unknown as JsonObject }
    ]);
    return result;
  }
}
