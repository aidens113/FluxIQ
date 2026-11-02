import type { RecordingActionVisualTargetIndexItem } from "@fluxiq/contracts/recording";
import type { ActionVisualEntityTarget } from "@fluxiq/contracts/runtime";

export function recordingActionVisualTargetIndexItem(target: ActionVisualEntityTarget | undefined): RecordingActionVisualTargetIndexItem | undefined {
  if (!target) return undefined;
  const item: RecordingActionVisualTargetIndexItem = {};
  if (target.entityId !== undefined) item.entityId = target.entityId;
  if (target.entityKind !== undefined) item.entityKind = target.entityKind;
  if (target.statePath !== undefined) item.statePath = target.statePath;
  if (target.stateSnapshotId !== undefined) item.stateSnapshotId = target.stateSnapshotId;
  if (target.visualFrameId !== undefined) item.visualFrameId = target.visualFrameId;
  if (target.visualLayerId !== undefined) item.visualLayerId = target.visualLayerId;
  if (target.confidence !== undefined) item.confidence = target.confidence;
  return item;
}
