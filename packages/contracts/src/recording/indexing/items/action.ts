import type { RecordingActionVisualTargetIndexItem } from "./visual-target.js";

export type RecordingActionIndexItem = {
  actionId: string;
  entryId: string;
  actionType: string;
  outputId?: string;
  startedAt?: number;
  completedAt?: number;
  stateBeforeId?: string;
  stateAtActionId?: string;
  stateAfterId?: string;
  visualTarget?: RecordingActionVisualTargetIndexItem;
  sourceObjectRefs?: string[];
};
