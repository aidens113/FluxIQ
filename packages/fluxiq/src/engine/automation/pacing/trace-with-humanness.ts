import { normalizeHumanness } from "@fluxiq/contracts/runtime";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../index.ts";

/**
 * The run's trace with the humanness it paused its nodes by and the seed that replays it,
 * so the step log records every random choice the engine made. At level 0 the very same
 * trace comes back, with no `humanness` key.
 */
export function automationStudioTraceWithHumanness<Trace extends AutomationStudioGraphExecutionTrace>(trace: Trace, options: Pick<AutomationStudioGraphExecutionOptions, "humanness" | "humannessSeed">): Trace {
  const level = normalizeHumanness(options.humanness);
  if (level <= 0) return trace;
  return { ...trace, humanness: { level, seed: options.humannessSeed ?? 0 } };
}
