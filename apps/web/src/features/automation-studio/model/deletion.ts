import type { AutomationSelection } from "../shared/selection-contracts";

export function selectionReferencesDeletedRecording(selection: AutomationSelection | null, recordingIds: Set<string>, proposalIds: Set<string>): boolean {
  if (!selection) return false;
  if (selection.kind === "recording") return recordingIds.has(selection.id);
  if (selection.kind === "state") {
    if (selection.recordingId && recordingIds.has(selection.recordingId)) return true;
    if (selection.proposalId && proposalIds.has(selection.proposalId)) return true;
    return selection.sourceId ? [...recordingIds].some((recordingId) => selection.sourceId === `observed:${recordingId}:initial` || selection.sourceId?.startsWith(`observed:${recordingId}:`)) : false;
  }
  return false;
}

export function removeDeletedRecordingArtifacts(current: any, recordingIds: Set<string>, proposalIds: Set<string>) {
  const filterByRecording = (items: any[] | undefined) => (items ?? []).filter((item: any) => !recordingIds.has(String(item.recordingId ?? item.metadata?.recordingId ?? "")));
  const filterByProposal = (items: any[] | undefined) => (items ?? []).filter((item: any) => !proposalIds.has(String(item.proposalId ?? item.id ?? "")) && !recordingIds.has(String(item.recordingId ?? item.metadata?.recordingId ?? "")));
  return {
    ...current,
    normalizationReviews: filterByRecording(current?.normalizationReviews),
    miningRuns: filterByRecording(current?.miningRuns),
    evidenceFacts: filterByRecording(current?.evidenceFacts),
    evidenceObservations: filterByRecording(current?.evidenceObservations),
    stateActionCorrelations: filterByRecording(current?.stateActionCorrelations),
    evidenceClaims: filterByRecording(current?.evidenceClaims),
    replayResults: filterByRecording(current?.replayResults),
    learnedTaskModels: filterByRecording(current?.learnedTaskModels),
    policyProposals: filterByProposal(current?.policyProposals),
    recordingFlowProposals: filterByProposal(current?.recordingFlowProposals)
  };
}

export function removeDeletedRecordingSnapshotData(current: any, recordingIds: Set<string>, proposalIds: Set<string>) {
  if (!current?.payload?.canonical) return current;
  const canonical = current.payload.canonical;
  const artifacts = removeDeletedRecordingArtifacts(canonical, recordingIds, proposalIds);
  return {
    ...current,
    payload: {
      ...current.payload,
      canonical: {
        ...canonical,
        ...artifacts,
        recordingSessions: (canonical.recordingSessions ?? []).filter((recording: any) => !recordingIds.has(String(recording.recordingId ?? ""))),
        normalizedTimelines: (canonical.normalizedTimelines ?? []).filter((timeline: any) => !recordingIds.has(String(timeline.recordingId ?? "")))
      }
    }
  };
}
