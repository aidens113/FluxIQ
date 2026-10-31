import type { AutomationStudioHostRuntimeActionContext, AutomationStudioHostStateSnapshotRef } from "../host-runtime.ts";

/** The resolved action and its already accepted capture; observing adds no action or capture. */
export type AutomationStudioRuntimeRepeatObservationInput = AutomationStudioHostRuntimeActionContext & {
  point: "before_action" | "after_action";
  stateRef: AutomationStudioHostStateSnapshotRef;
  signal?: AbortSignal;
};
