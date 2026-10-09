import { runtimeAttemptRecord } from "./attempt-record";
import type { RuntimeAttemptStoryLine, RuntimeAttemptStoryOptions } from "./story-line";
import { runtimeStepWords } from "./words";

/** The ready-state code: the step's ready state was judged and not met, and nothing was dispatched. */
const READY_STATE_NOT_SHOWN = "executor.ready_state.not_shown";

/**
 * The `skipped` record: a step the run passed over rather than ran. An
 * optional step that was not there says so; a state route names the step it
 * skipped and the step the run went on with, in the words the chat announces
 * it with (Core's `executor/state-routing/announcement.ts`).
 */
export function runtimeSkippedLine(attempt: unknown, options: RuntimeAttemptStoryOptions = {}): RuntimeAttemptStoryLine | undefined {
  const skipped = runtimeAttemptRecord(attempt, "skipped");
  if (!skipped) return undefined;
  const step = runtimeStepWords((attempt as { nodeId?: unknown }).nodeId, options);
  if (skipped.reason === "target_absent") {
    const why = skipped.code === READY_STATE_NOT_SHOWN ? "the page did not show what it needs" : "it was not shown";
    return { kind: "skipped", text: `Skipped ${step}: ${why}, so the run went on without it.` };
  }
  if (skipped.reason !== "state_routed") return undefined;
  const next = runtimeStepWords(skipped.toNodeId, options);
  const effectHolds = runtimeAttemptRecord(attempt, "stateRouting")?.outcome === "effect_holds";
  const why = effectHolds ? "the page already shows what it does"
    : skipped.direction === "backward" ? "the page went back to an earlier step"
    : "the page is already past it";
  return { kind: "state_routed", text: `Skipped ${step}: ${why}. Continuing with ${next}.` };
}
