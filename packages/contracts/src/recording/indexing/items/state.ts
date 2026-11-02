import type { RecordingStateCoordinateSpace } from "./coordinate-space.js";

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
