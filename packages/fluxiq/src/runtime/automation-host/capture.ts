import type { AutomationStudioHostStateSnapshotRef } from "./boundary.ts";

/** A host may explicitly decline a node outside the state it observes. Capture faults still throw. */
export type AutomationStudioHostStateCapture = AutomationStudioHostStateSnapshotRef | {
  kind: "unavailable";
  reason: "unsupported_node";
};
