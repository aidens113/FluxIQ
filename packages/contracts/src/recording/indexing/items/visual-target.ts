import type { StatePath } from "../../../state/index.js";

export type RecordingActionVisualTargetIndexItem = {
  entityId?: string;
  entityKind?: string;
  statePath?: StatePath;
  stateSnapshotId?: string;
  visualFrameId?: string;
  visualLayerId?: string;
  confidence?: number;
};
