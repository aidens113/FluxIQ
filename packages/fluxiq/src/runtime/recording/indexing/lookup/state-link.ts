import { readRecordingIndexItem } from "../dictionary/index.ts";
import type { ProposalNodeStateLink, RecordingIndex } from "@fluxiq/contracts/recording";

export function proposalNodeStateLinkFromIndex(index: RecordingIndex, actionEntryId: string): ProposalNodeStateLink | undefined {
  const entry = readRecordingIndexItem(index.entries, actionEntryId);
  const action = entry?.actionId ? readRecordingIndexItem(index.actions, entry.actionId) : undefined;
  const stateSnapshotId = action?.stateAtActionId ?? entry?.stateSnapshotId;
  const state = stateSnapshotId ? readRecordingIndexItem(index.states, stateSnapshotId) : undefined;
  if (!entry || !state) return undefined;
  const link: ProposalNodeStateLink = { recordingId: index.recordingId, actionEntryId, stateSnapshotId: state.stateSnapshotId, stateRef: state.stateRef };
  if (entry.actionId) link.actionId = entry.actionId;
  if (state.screenshotRef) link.screenshotRef = state.screenshotRef;
  return link;
}
