import { runtimeChildRunLine } from "./child-run";
import { runtimeDefenceLine } from "./defence";
import { runtimeInterferenceLine } from "./interference";
import { runtimeLadderLine } from "./ladder";
import { runtimeLifecycleLines } from "./lifecycle";
import { runtimePaceHeldLine, runtimePaceRaisedLine } from "./pace";
import { runtimePartLine } from "./part";
import { runtimeReadinessLine } from "./readiness";
import { runtimeRetriedLine } from "./retried";
import { runtimeSkippedLine } from "./skipped";
import { runtimeStateRoutingLine } from "./state-routing";
import type { RuntimeAttemptStoryLine, RuntimeAttemptStoryOptions } from "./story-line";

/**
 * What the runtime did for one attempt, in plain words and in the order it did
 * it: why the step was attempted again and what that waited, the pace and
 * readiness waits before it started, a called Flow's or part's run, where the
 * run went when the step could not run, where its frame began and the handler
 * that ran, how the failure was judged and counted, what recovery chose next,
 * and a pace raised for the starts after it.
 *
 * Read only from the runtime's own records on the attempt, never from a model.
 * An attempt with none of them has no story, and the panel shows nothing extra.
 */
export function runtimeAttemptStory(attempt: unknown, options: RuntimeAttemptStoryOptions = {}): RuntimeAttemptStoryLine[] {
  if (typeof attempt !== "object" || attempt === null || Array.isArray(attempt)) return [];
  const lines: Array<RuntimeAttemptStoryLine | undefined> = [
    runtimeRetriedLine(attempt),
    runtimeInterferenceLine(attempt),
    runtimePaceHeldLine(attempt),
    runtimeReadinessLine(attempt),
    runtimeChildRunLine(attempt),
    runtimePartLine(attempt, options),
    runtimeSkippedLine(attempt, options),
    runtimeStateRoutingLine(attempt, options),
    ...runtimeLifecycleLines(attempt, options),
    runtimeDefenceLine(attempt),
    runtimeLadderLine(attempt, options),
    runtimePaceRaisedLine(attempt)
  ];
  return lines.filter((line): line is RuntimeAttemptStoryLine => line !== undefined);
}
