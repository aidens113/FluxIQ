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
