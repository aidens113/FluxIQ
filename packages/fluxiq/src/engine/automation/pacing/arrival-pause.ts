import { normalizeHumanness } from "@fluxiq/contracts/runtime";
import { automationStudioRunOverrides } from "../../../runtime/run-overrides/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../index.ts";
import { automationStudioHumanPauseMs } from "./human-pause.ts";

/**
 * How long a run holds still before it first arrives at a node: the human pause at the
 * run's humanness (`./human-pause.ts`), never less than a developer's least step gap
 * (W3's run override `pace.minStepGapMs`, `runtime/run-overrides`). At level 0 with no
 * override it is 0, and the caller awaits nothing, so the run is today's path exactly.
 */
export function automationStudioArrivalPauseMs(options: Pick<AutomationStudioGraphExecutionOptions, "humanness" | "humannessSeed">, nodeId: string, ordinal: number): number {
  const minStepGapMs = automationStudioRunOverrides()?.pace?.minStepGapMs;
  if (normalizeHumanness(options.humanness) <= 0 && minStepGapMs === undefined) return 0;
  return automationStudioHumanPauseMs(options.humanness, options.humannessSeed ?? 0, nodeId, ordinal, minStepGapMs);
}
