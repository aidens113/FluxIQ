// One step of an exploration as the runner recorded it: what was asked for,
// and what the state was either side of it.
//
// This is the second half of the exploration's own record, beside the evidence
// loop's trace, and it is written by the same runner in the same pass, keyed by
// the same `callId`. That is deliberate and it is the decision this record
// exists to enforce: the alternative -- every caller keeping a side-record of
// the exploration it drove -- is two accounts of one run, and two accounts of
// one run disagree. There is one recorder, it is the code that calls the
// action, and everything downstream joins to it by call id.
//
// **`input` is here because a reduced sequence nobody can replay is not a fix.**
// The runner already built `actionSignature(toolId, canonicalJson(value))` for
// repeat detection and kept only the signature, so the exploration named the
// action and not what it was asked to do. The signature cannot be turned back
// into an argument, so the argument itself is kept.
//
// **Both digests are optional, and an absent one is not a zero.** It means the
// caller could not say what the state was at that moment -- it bound no digest
// source at all, or the one it bound declined or threw. A step missing either
// digest cannot be placed on the chain, and the reduction reports it as a gap
// rather than assuming the state stood still.

import type { JsonObject } from "../../../../../core/index.ts";

export type AutomationStudioExplorationStepRecord = {
  /** The call id the evidence-loop trace carries for this same step. */
  callId: string;
  /** Which action ran. Opaque to Core, and the trace's `toolId` for this step. */
  toolId: string;
  /**
   * Which trace entry this step is, when the loop recorded one. Absent for a
   * step the loop never got to record -- the join is by `callId`, and this is
   * how a reader lines the two up by eye.
   */
  iteration?: number;
  /** The argument the action was given, so a kept step can be run again. */
  input: JsonObject;
  /** The state before the step ran, as the caller digested it. */
  stateBefore?: string;
  /** The same digest taken after it. */
  stateAfter?: string;
};
