import type { RuntimeAttemptStoryLine, RuntimeAttemptStoryOptions } from "./story-line";

/**
 * The place for the lifecycle records the state-aware recovery plan adds next
 * (Core's `docs/working/state-aware-recovery-plan.md`, C11): the frame a step
 * ran in, handler runs, entry choices, a true failure as against a planned
 * fail, and an in-run repair.
 *
 * None of them is on the persisted attempt trace yet, so this reads nothing
 * and returns no lines. When Core persists one, add its kind to
 * `RuntimeAttemptStoryKind`, a module beside this one that reads that record
 * as Core defines it, and its call here; `runtimeAttemptStory` already places
 * these lines after the step's own records and before how its failure was
 * judged. Do not guess at their fields before they exist.
 */
export function runtimeLifecycleLines(_attempt: unknown, _options: RuntimeAttemptStoryOptions = {}): RuntimeAttemptStoryLine[] {
  return [];
}
