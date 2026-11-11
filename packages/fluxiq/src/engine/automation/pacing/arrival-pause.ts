import { normalizeHumanness } from "@fluxiq/contracts/runtime";
import { automationStudioRunOverrides } from "../../../runtime/run-overrides/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../index.ts";
import { automationStudioHumanPauseMs } from "./human-pause.ts";

/**
 * Whether a node acts on the world through a client, which is what a person's pace is about:
 * a domain's own nodes and Core's policy actions dispatch to a client; Core's other built-ins
 * (control, data, database, flow, logic, math, random, routine, timing) never touch the page,
 * so a person's pause before them would only slow the run. A Call Flow node gets none either:
 * the subflow's own steps pause themselves.
 */
function actsThroughClient(definitionId: string): boolean {
  return !definitionId.startsWith("builtin.") || definitionId.startsWith("builtin.policy.");
}

/**
 * How long a run holds still before it first arrives at a node that acts on the world: the
 * human pause at the run's humanness (`./human-pause.ts`), never less than a developer's least
 * step gap (W3's run override `pace.minStepGapMs`, `runtime/run-overrides`). A node that only
 * steers the run (`actsThroughClient`) gets none. At level 0 with no override it is 0, and the
 * caller awaits nothing, so the run is today's path exactly.
 */
export function automationStudioArrivalPauseMs(options: Pick<AutomationStudioGraphExecutionOptions, "humanness" | "humannessSeed">, node: { id: string; definitionId: string }, ordinal: number): number {
  const minStepGapMs = automationStudioRunOverrides()?.pace?.minStepGapMs;
  if (normalizeHumanness(options.humanness) <= 0 && minStepGapMs === undefined) return 0;
  if (!actsThroughClient(node.definitionId)) return 0;
  return automationStudioHumanPauseMs(options.humanness, options.humannessSeed ?? 0, node.id, ordinal, minStepGapMs);
}
