// What a caller reports back about one tool call: what it saw, what it changed,
// and what the draft should say about it.
//
// The loop reads almost none of this. The evidence is opaque, the codes are the
// caller's own vocabulary, and `draft` is the caller's statement about its own
// call -- which is what lets one tool run a whole library of actions.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStepReplay } from "../../flow-draft/index.ts";

export type AutomationStudioLlmEvidenceToolExecutionResult = {
  kind: "llm_evidence_tool_execution";
  evidence: JsonValue;
  effectApplied: boolean;
  /** True only when every target handle from before this mutation still names
   * the same target afterwards. Consumers may omit it and stay conservative. */
  targetsUnchanged?: boolean;
  resultCode?: string;
  /**
   * Why the call came to that code, from the caller's own closed vocabulary.
   *
   * The caller computes one reason per outcome and is the only thing that can:
   * the web domain distinguishes thirty-three of them behind two published
   * codes. Core carries it and reads it never; a value that is not code-shaped
   * is dropped rather than refusing the execution result, because a reason is a
   * diagnostic and the call it describes still happened.
   */
  resultReason?: string;
  /**
   * How many times in a row this caller has now answered this call with what it
   * had already answered, counting from 2 -- the caller's own statement that
   * the call it just made carried nothing the model did not hold.
   *
   * **Why the loop cannot work this out for itself.** It can, and does, for an
   * answer that repeats byte for byte (`../evidence-loop.ts`). What it cannot
   * see is an answer that repeats *and says so*: a caller that writes the
   * repetition onto the packet -- which is the right thing for it to do, since
   * a model told the same words again has no way to tell a repeat from a new
   * answer that happens to agree -- makes every repeat differ from the last by
   * the count it carries. On `run-mulum3x7-18ceeb75` the web domain's own
   * repeat notice did exactly that, and Core's byte comparison went blind to
   * the five refusals it was announcing.
   *
   * So the caller says it here, in a number Core reads as a count and never as
   * a code. A repeat is not a reason to refuse anything: the call happened, its
   * evidence stands, and only the loop's no-progress guard is told. A value
   * that is not a whole number of two or more is dropped, like the other
   * diagnostics beside it.
   */
  repeatedAnswer?: number;
  /**
   * True when the call met something only a person can get past -- a robot
   * check, in the web domain's words -- and the caller did not act on it.
   *
   * Core never shows such a result to the model as it stands, because a model
   * told "that failed, try again" knocks on the check until it is locked out
   * (`run-munp80f5-c31ea417`). The build puts the person-needed question in the
   * Flow's thread (`../../parking/person-needed-ask.ts`) and waits. If the
   * person completes the check and presses Continue, the call stands as though
   * it had succeeded, with the `draft` given here, and a fresh look at the page
   * replaces its evidence; so a caller setting this describes in `draft` the
   * step as it would stand once the check is cleared. Otherwise the build ends
   * `flow_bootstrap.user_intervention_required`.
   */
  personNeeded?: true;
  /**
   * The node this call ran, resolved by the caller against its own catalog.
   *
   * Only a name the caller resolved may be reported here. A name the model
   * wrote and the caller could not find is not a node id, and the reason for
   * the refusal says so on its own.
   */
  nodeId?: string;
  /**
   * The state the call found and the state it left, digested from the captures
   * the call itself took -- a look's one capture is both, an action's read
   * before acting is `before` and its read after is `after`.
   *
   * **Why the call says it rather than the loop asking.** The loop used to ask
   * the caller's `captureStateDigest` before and after every call, and the web
   * domain answered each with a whole page capture of its own: a look cost
   * three captures and an action four, each one a "Looking at the page" the
   * person watching the side panel saw (`run-munneauy-de8663ed`, about 39
   * captures for 3 looks and 3 actions). The call already holds those states.
   * A caller that reports them here, and says so on its binding
   * (`stateDigestsOnCalls`), is never asked for one around a call.
   *
   * Opaque, compared only for equality, and held to the same contract as
   * `captureStateDigest`: a digest of the world the call saw, never of the
   * evidence it returned. A value that is not code-shaped is dropped, and the
   * step is then simply unobserved on that side.
   */
  stateDigests?: { before?: string; after?: string };
  /**
   * The route state of the page the call left -- what a Router's `state.*`
   * conditions would read there -- projected by the caller from the capture
   * the call itself took, exactly as its host runtime's `observeRouteState`
   * projects a fresh one.
   *
   * **Why the call says it.** A Flow build shows the model every route state
   * its exploration reached, and it used to learn each one by asking the host
   * for a whole page capture before the next decision (`../../route-state/build-routing.ts`):
   * after t196 removed the digest captures, that was the largest browser cost
   * left per decision. The call already holds that page. The loop itself never
   * reads this; the build's routing does, from the results it is handed, and
   * captures only when no call has left a current one.
   */
  routeState?: JsonObject;
  /**
   * What this one call did, for the draft the loop is accruing.
   *
   * A tool that runs whichever of a library's things the call named answers
   * here: which thing (`actionId`), what it ran with (`input`), whether it read
   * or changed (`effect`), and whether a result should contain it
   * (`proposes`) -- `false` for a call that failed or that belongs in no
   * result. Core reads none of it: the name is opaque, the argument is carried
   * so the step can be written down or run again, and the two flags are the
   * caller's statement about its own call.
   *
   * Absent, the tool's own declaration stands, which is what every tool that
   * does one thing has always relied on.
   */
  draft?: {
    actionId?: string;
    input?: JsonObject;
    /** What the call really ran with, where that differs from what was written. */
    ranWith?: JsonObject;
    effect?: "observe" | "mutate";
    proposes?: boolean;
    /**
     * What running this call again would need, when the caller can run it
     * again: how to put the target back the way it found it, and what it
     * produced, so the caller can say later whether a replay produced it again.
     *
     * Saying it is what puts the call's step under the dry run: a draft whose
     * proposed steps all carry it must replay clean before it may be proposed
     * (`../../flow-draft/dry-run.ts`), and one that does not is simply not
     * replayed. Both fields are carried opaquely; Core reads neither.
     */
    replay?: AutomationStudioFlowDraftStepReplay;
  };
};
