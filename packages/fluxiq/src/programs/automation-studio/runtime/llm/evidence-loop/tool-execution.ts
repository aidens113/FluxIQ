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
   * The node this call ran, resolved by the caller against its own catalog.
   *
   * Only a name the caller resolved may be reported here. A name the model
   * wrote and the caller could not find is not a node id, and the reason for
   * the refusal says so on its own.
   */
  nodeId?: string;
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
