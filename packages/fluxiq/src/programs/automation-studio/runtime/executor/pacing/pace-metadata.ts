import type { AutomationStudioFlowNode } from "../../../model/index.ts";

/**
 * The Flow node metadata key a pace is authored under: a positive whole number
 * of milliseconds, the least time between two successive starts of that node in
 * one run. Written by the Flow script's pace syntax and by a promotion that
 * keeps the pace a trial learned; read by every graph run, trial and playback
 * alike (`./pace-keeper.ts`).
 */
export const AUTOMATION_STUDIO_PACE_METADATA_KEY = "paceMs";

/** The node's authored pace, or nothing when it has none or holds anything but a positive whole number of milliseconds. */
export function automationStudioAuthoredPaceMs(node: Pick<AutomationStudioFlowNode, "metadata">): number | undefined {
  const value = node.metadata?.[AUTOMATION_STUDIO_PACE_METADATA_KEY];
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
