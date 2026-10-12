import { runtimeAttemptRecord } from "./attempt-record";
import type { RuntimeAttemptStoryLine, RuntimeAttemptStoryOptions } from "./story-line";
import { runtimeStepWords, runtimeStoryNumber } from "./words";

/**
 * The `stateRouting` record when it did not route the run on: the run looked
 * for where the page is in the Flow and found no way on, or the guard against
 * going back without progress stopped it. A route that did go on is told by
 * the `skipped` line, which carries where it went, so it is not told twice.
 */
export function runtimeStateRoutingLine(attempt: unknown, options: RuntimeAttemptStoryOptions = {}): RuntimeAttemptStoryLine | undefined {
  const routing = runtimeAttemptRecord(attempt, "stateRouting");
  if (!routing) return undefined;
  const to = typeof routing.toNodeId === "string" && routing.toNodeId ? runtimeStepWords(routing.toNodeId, options) : undefined;
  if (routing.outcome === "routed" || routing.outcome === "effect_holds") {
    if (runtimeAttemptRecord(attempt, "skipped")?.reason === "state_routed" || !to) return undefined;
    return { kind: "state_routing", text: `The page matched ${to}, so the run went on there.` };
  }
  if (routing.outcome === "guard_stopped") {
    return { kind: "state_routing", text: `Stopped going back to ${to ?? "an earlier step"}: the run had already returned there without getting any further.` };
  }
  if (routing.outcome === "no_match") {
    const candidates = runtimeStoryNumber(routing.candidates);
    const compared = candidates ? ` (compared ${candidates} ${candidates === 1 ? "step" : "steps"})` : "";
    return { kind: "state_routing", text: `Looked for where the page is in the Flow and found no matching step${compared}.` };
  }
  if (routing.outcome === "unobserved") return { kind: "state_routing", text: "Could not read the page to find where the run is in the Flow." };
  if (routing.outcome === "no_pre_states") return { kind: "state_routing", text: "No other step recorded how the page looked, so there was nothing to compare the page with." };
  return undefined;
}
