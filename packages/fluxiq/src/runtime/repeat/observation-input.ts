import type { AutomationStudioHostRuntimeActionContext, AutomationStudioHostStateSnapshotRef } from "../automation-host/index.ts";

/** The resolved action and its already accepted capture; observing adds no action or capture. */
export type AutomationStudioRuntimeRepeatObservationInput = AutomationStudioHostRuntimeActionContext & {
  point: "before_action" | "after_action";
  stateRef: AutomationStudioHostStateSnapshotRef;
  signal?: AbortSignal;
};
