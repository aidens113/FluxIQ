import { runtimeClearedLayersLine } from "./cleared-layers";
import { runtimeEntryLine } from "./entry";
import { runtimeFailureClassLine } from "./failure-class";
import { runtimeHandlerLine } from "./handler";
import { runtimeRepairLine } from "./repair";
import type { RuntimeAttemptStoryLine, RuntimeAttemptStoryOptions } from "./story-line";

/**
 * The lifecycle records of state-aware recovery (Core's
 * `docs/working/state-aware-recovery-plan.md`, C11), in the order the run met
 * them: where the frame began, the handler that ran at the step, the layers
 * the client closed while it ran, what its failure counted as (a true failure
 * against a planned fail), and the in-run repair a true failure asked for.
 * `runtimeAttemptStory` places these after the step's own records and before
 * how its failure was judged. Each reads its record's own fields, as Core
 * defines them, never a model's words.
 */
export function runtimeLifecycleLines(attempt: unknown, options: RuntimeAttemptStoryOptions = {}): RuntimeAttemptStoryLine[] {
  return [
    runtimeEntryLine(attempt, options),
    runtimeHandlerLine(attempt, options),
    runtimeClearedLayersLine(attempt),
    runtimeFailureClassLine(attempt),
    runtimeRepairLine(attempt)
  ].filter((line): line is RuntimeAttemptStoryLine => line !== undefined);
}
