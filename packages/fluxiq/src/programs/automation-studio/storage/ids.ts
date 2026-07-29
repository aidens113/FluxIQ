import type { LearnedTaskModel } from "../learning";
import type { NormalizedTimeline } from "../normalization";
import type { PolicyGraph, RecordingSession, SignalRegistry } from "../model";

export type CanonicalAutomationStudioArtifact =
  | RecordingSession
  | NormalizedTimeline
  | SignalRegistry
  | LearnedTaskModel
  | PolicyGraph;

export type CanonicalAutomationStudioArtifactKind =
  | "recording_session"
  | "normalized_timeline"
  | "signal_registry"
  | "learned_task_model"
  | "policy_graph";

export type AutomationStudioDocumentIdentity = {
  kind: CanonicalAutomationStudioArtifactKind;
  id: string;
  domainId?: string | null;
  taskId?: string;
};

export function recordingSessionDocumentId(recording: RecordingSession): string {
  return recording.recordingId;
}

export function normalizedTimelineDocumentId(timeline: NormalizedTimeline): string {
  return timeline.normalizedTimelineId;
}

export function signalRegistryDocumentId(registry: SignalRegistry): string {
  return registry.registryId;
}

export function learnedTaskModelDocumentId(model: LearnedTaskModel): string {
  return model.learnedTaskModelId;
}

export function policyGraphDocumentId(policy: PolicyGraph): string {
  return policy.policyId;
}

export function canonicalArtifactIdentity(artifact: CanonicalAutomationStudioArtifact): AutomationStudioDocumentIdentity {
  if ("normalizedTimelineId" in artifact) {
    return withOptionalIdentityFields({
      kind: "normalized_timeline",
      id: normalizedTimelineDocumentId(artifact)
    }, readDomainId(artifact.metadata), artifact.taskId);
  }
  if ("recordingId" in artifact) {
    return withOptionalIdentityFields({
      kind: "recording_session",
      id: recordingSessionDocumentId(artifact)
    }, artifact.environment.domainId, artifact.taskId);
  }
  if ("registryId" in artifact) {
    return withOptionalIdentityFields({
      kind: "signal_registry",
      id: signalRegistryDocumentId(artifact)
    }, readDomainId(artifact.metadata));
  }
  if ("learnedTaskModelId" in artifact) {
    return withOptionalIdentityFields({
      kind: "learned_task_model",
      id: learnedTaskModelDocumentId(artifact)
    }, readDomainId(artifact.metadata), artifact.taskId);
  }
  return withOptionalIdentityFields({
    kind: "policy_graph",
    id: policyGraphDocumentId(artifact)
  }, readDomainId(artifact.metadata), artifact.taskId);
}

function withOptionalIdentityFields(
  base: Pick<AutomationStudioDocumentIdentity, "kind" | "id">,
  domainId?: string | null,
  taskId?: string
): AutomationStudioDocumentIdentity {
  const identity: AutomationStudioDocumentIdentity = { ...base };
  if (domainId !== undefined) identity.domainId = domainId;
  if (taskId !== undefined) identity.taskId = taskId;
  return identity;
}

function readDomainId(metadata: { domainId?: unknown } | undefined): string | null | undefined {
  if (!metadata || !("domainId" in metadata)) return undefined;
  return typeof metadata.domainId === "string" || metadata.domainId === null ? metadata.domainId : undefined;
}
