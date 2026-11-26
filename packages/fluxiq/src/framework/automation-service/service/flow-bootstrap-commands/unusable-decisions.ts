// How a build's evidence loop asks again after a decision it could not use,
// for every authoring mode: the one place those options are built.
//
// **Why it is shared (t354).** The legacy round passed the loop
// `unusableDecisions` and the candidate loop did not, so in lane A round 3
// (`run-muyqgopm-1bfa7054`) the first reply the candidate loop could not use --
// a whole `core.submit_candidate` call whose wrapper said `callId` where
// `tool_call` belongs -- was rethrown at once and ended the build, while the
// chat had just said it was asking again. Two copies of these options is the
// shape that let one mode lose them, so both modes now build them here.
//
// What the loop does with them (`../../llm/loop-configuration.ts`): an
// unusable decision is shown to the model as feedback and asked again on the
// same model, each one paid from the purse. No count of them in a row ends the
// loop (t1056); `stalled` builds the ending only for a round the loop's caller
// ends on loop detection's signal. The build's own endings -- a question put to
// the person: a permission ask, a check only they can pass -- win over that
// stall, because the build waits on the person's answer rather than end past it.
import type { AutomationStudioLlmEvidenceLoopInput } from "../../../../runtime/llm/index.ts";

type UnusableDecisions = NonNullable<AutomationStudioLlmEvidenceLoopInput["unusableDecisions"]>;
type Stall = Parameters<UnusableDecisions["stalled"]>[0];

/** The loop's `unusableDecisions`: the caller's endings first, then its stall. */
export function automationStudioFlowBootstrapUnusableDecisions(input: {
  /** The build's own ending a stall yields to, or `undefined` where there is none. */
  callerEnding(progress: Stall): unknown;
  /** The error that ends a stalled loop: what the loop throws under `propagateDecisionErrors`. */
  stalled(progress: Stall): unknown;
}): UnusableDecisions {
  return { stalled: (progress) => input.callerEnding(progress) ?? input.stalled(progress) };
}
