import type { AutomationStudioHostStateSnapshotRef } from "./boundary.ts";

/**
 * A host may explicitly decline a node outside the state it observes, or the page a
 * navigation is about to leave, which no step depends on and may be one nothing can read.
 * Capture faults still throw.
 */
export type AutomationStudioHostStateCapture = AutomationStudioHostStateSnapshotRef | {
  kind: "unavailable";
  reason: "unsupported_node" | "page_left_by_navigation";
};
