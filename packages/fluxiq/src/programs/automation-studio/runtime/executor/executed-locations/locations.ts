// The real page address of each step whose saved trace withheld it (t738).
//
// A step's state diff may carry `controls.location`, the address of the page
// its control sat on (L1 d7), so a build's reset ledger knows where to look to
// see that control come back. `stateDiff` is a data key of the trace's
// withholding (`../trace-withholding.ts`), so when a step reached its page
// through a row-bound or input-bound address (`url: $row.link`) the saved trace
// reads that location as the withholding marker, and a trial act read off it
// could never be put back: rerun round 2 `run-mvgf801u-cc23575e` printed 24
// settle clauses that named no page.
//
// The saved trace stays withheld exactly as it was. What this keeps is the one
// string the run executed with, in memory only, keyed by the saved trace's own
// `controls` object, the one a reader holds when it reads the step. Nothing else
// of the executed trace is kept: a reader that wants the address asks for this
// witness's, and every other field it reads stays the withheld one.
//
// A saved attempt is paired with the executed attempt of the same id and node in
// the same frame, so an attempt the saved trace adds (a lifecycle handler body)
// pairs with none. A Call Subflow or Call Flow attempt keeps its child's saved
// trace in both copies; a child's own run registered its attempts, and when the
// parent's withholding copied them the copy is paired with the original and the
// address passed on.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../contracts.ts";

/** Each saved `controls` witness the withholding rewrote, and the location the run executed with. */
const locations = new WeakMap<object, string>();

/** No frame nests deeper than this in a run; past it nothing is paired. */
const MAXIMUM_FRAME_DEPTH = 64;

/** The executed address behind a saved trace's withheld `controls.location` (header). */
export const automationStudioExecutedLocations = {
  /** Pairs the trace the run executed with the saved trace it returned; called once per graph run (`../graph-run.ts`). */
  remember(executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace): void {
    if (executed !== saved) pair(executed.attempts, saved.attempts, 0);
  },
  /** The location the run executed with for this saved `controls` witness, or none when it was never rewritten. */
  of(witness: JsonValue | undefined): string | undefined {
    return typeof witness === "object" && witness !== null ? locations.get(witness) : undefined;
  }
};

function pair(executed: readonly AutomationStudioNodeAttemptTrace[], saved: readonly AutomationStudioNodeAttemptTrace[], depth: number): void {
  if (depth > MAXIMUM_FRAME_DEPTH || !Array.isArray(executed) || !Array.isArray(saved)) return;
  // An id seen twice in one frame is ambiguous, and pairs with nothing.
  const byId = new Map<string, AutomationStudioNodeAttemptTrace | null>();
  for (const attempt of executed) byId.set(attempt.attemptId, byId.has(attempt.attemptId) ? null : attempt);
  for (const kept of saved) {
    const ran = byId.get(kept.attemptId);
    if (!ran || ran.nodeId !== kept.nodeId) continue;
    const real = controlsOf(ran), shown = controlsOf(kept);
    if (real && shown && real !== shown) {
      const location = locations.get(real) ?? (typeof real.location === "string" ? real.location : undefined);
      if (location !== undefined) locations.set(shown, location);
    }
    if (ran.childTrace && kept.childTrace && ran.childTrace !== kept.childTrace) pair(ran.childTrace.attempts, kept.childTrace.attempts, depth + 1);
  }
}

function controlsOf(attempt: AutomationStudioNodeAttemptTrace): JsonObject | undefined {
  const controls = attempt.stateRefs?.stateDiff?.controls;
  return typeof controls === "object" && controls !== null && !Array.isArray(controls) ? controls : undefined;
}
