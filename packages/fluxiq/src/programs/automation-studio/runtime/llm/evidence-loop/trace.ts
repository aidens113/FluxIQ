// One row of the record a loop leaves behind: what it decided, what came back,
// and when.
//
// **Every member declared here has to be carried by every rebuilder on the way
// out.** The row is rebuilt member by member in five places between this
// declaration and a run's stored artifacts, and three times a member added here
// was silently dropped by one of them -- a live build published 22 rows carrying
// neither the reason a call was refused nor the node it ran, although the loop
// set both (`run-muhd1vc7-0ec27a16`). A member added to this type is not
// carried by being declared; it is carried by
// `../../flow-bootstrap/evidence-loop-steps.ts` and
// `../../service/flow-bootstrap-commands/evidence-trace.ts` agreeing to carry
// it, and by the tests that hold both shut.

import type { AutomationStudioFlowDraftAmendmentRefusal } from "../../flow-draft/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmUsageSummary } from "../harness.ts";
import type { AutomationStudioLlmEvidenceLoopAnswerability } from "./answerability.ts";
import type { AutomationStudioLlmEvidenceRestoredStep } from "./completion-check.ts";
import type { AutomationStudioLlmEvidenceLoopDraftChange } from "./draft-change.ts";
import type { AutomationStudioLlmEvidenceLoopDraftShown } from "./draft-shown.ts";
import type { AutomationStudioLlmEvidenceLoopProgress } from "../evidence-progress/index.ts";

export type AutomationStudioLlmEvidenceLoopTrace = {
  iteration: number;
  /** `unusable` is a decision call that was made and came back as nothing the
   * loop could act on, and was asked again. It names no tool. */
  decision: "tool_call" | "complete" | "unusable" | "amend_draft";
  callId?: string;
  toolId?: string;
  evidenceBytes?: number;
  effectApplied?: boolean;
  resultCode?: string;
  /**
   * Why the call came to that code, in the caller's own closed vocabulary.
   *
   * A code says which family a refusal belongs to; a reason says which refusal
   * it was. A live build (`run-mug776kx-0214b287`) spent 38 calls and published
   * 14 rows reading `web.action.rejected.invalid_input` and 8 reading
   * `web.action.rejected.target_unobserved` -- three or four separate defects
   * wearing two words between them: a node that cannot run where it was asked
   * to, an argument carrying keys the node does not take, a handle that is not
   * a handle, a handle naming nothing observed yet. The domain computed the
   * exact reason for every one of those rows and nothing carried it out.
   *
   * Carried, never read. Core's only claim about it is its shape: a code, with
   * no whitespace and so no sentence.
   */
  resultReason?: string;
  /** Caller-screened structural facts; Core does not interpret this optional object. */
  diagnostic?: JsonObject;
  /**
   * The node this call ran, where the caller resolved one against its own
   * catalog.
   *
   * Absent where it resolved none -- which is the answer in its own right when
   * the reason is that the model named a node that does not exist. It is
   * deliberately not "the node the model asked for": a row carries identifiers
   * the caller vouches for, never a string the model invented.
   */
  nodeId?: string;
  /**
   * How many draft steps this decision's amendments actually edited.
   *
   * One decision may carry sixteen amendments and `resultCode` records one word
   * for all of them, `rerun` beating everything applied beside it. So the code
   * is equally consistent with one edit and with sixteen, and a Flow that came
   * out nine steps short read exactly like one that corrected a single
   * argument.
   */
  amended?: number;
  /**
   * Which of this decision's amendments changed nothing, and why.
   *
   * `amended` says how many landed; this says what became of the rest, which is
   * the difference between a model editing a step that does not exist and one
   * restating what the draft already said. `run-muhubegx-9469de5e` made nine
   * amend decisions, seven of which applied nothing and five of those in a row,
   * and the record kept one word -- `llm_evidence_loop.draft_unchanged` -- for
   * all seven: the draft had computed the exact reason for every refused
   * amendment and nothing carried it out.
   *
   * A step number the model wrote and a reason from a closed set
   * (`../../flow-draft/amendment.ts`), never a value from a page, and at most
   * the sixteen amendments one decision may carry. The loop's own refusals are
   * here too: a `rerun` it declined to carry out says so through this field
   * rather than disappearing (`./rerun-request.ts`).
   */
  amendmentsRefused?: ReadonlyArray<AutomationStudioFlowDraftAmendmentRefusal & {
    /**
     * The node the refused amendment's step held when it was refused. Absent
     * where the step named no step at all, which `no_such_step` says.
     * `run-mulx76vv-a882551e` refused eighteen amendments and no record said
     * which node any of them was about.
     */
    nodeId?: string;
  }>;
  /**
   * What this decision was shown of the draft, and what showing it cost
   * (`./draft-shown.ts`).
   *
   * Absent means the decision was shown no draft, which after t157 has exactly
   * one cause: the build had taken no action a Flow could be made of yet. It
   * used to have a second, and that is why this member exists -- a draft budget
   * beneath the entry's own floor returned nothing, the caller filtered the
   * nothing out of what it shows, and the model amended a Flow it had never been
   * shown, with no refusal, no row and no log line anywhere in the run.
   *
   * Its own fields are counts and bytes, so the question "was the model shown
   * its whole draft?" is a lookup rather than a reconstruction of the steps from
   * the rest of this trace, which is what answering it cost by hand on
   * 2026-09-26.
   *
   * It is carried through both stored/public trace rebuilders member by member;
   * their exhaustive preservation tests protect that boundary.
   */
  draft?: AutomationStudioLlmEvidenceLoopDraftShown;
  /** Content-free revision and state transition for this row. */
  progress?: AutomationStudioLlmEvidenceLoopProgress;
  /** Stable step identities and bounded counts for an amendment row. */
  draftChange?: AutomationStudioLlmEvidenceLoopDraftChange;
  /** Capability facts observed for a completion row. */
  answerability?: AutomationStudioLlmEvidenceLoopAnswerability;
  /** A withdrawn step the completion check put back before judging the draft (`./completion-check.ts`). */
  restoredStep?: AutomationStudioLlmEvidenceRestoredStep;
  /**
   * When the row was recorded, in epoch milliseconds.
   *
   * It belongs on the loop's own row because the loop is the only thing that
   * knows when a row happened. It was first declared downstream, on the row a
   * reader sees and the step it publishes
   * (`../../flow-bootstrap/evidence-loop-steps.ts`), on the reasoning that a
   * timestamp is a diagnostic rather than part of how a build runs -- and the
   * consequence was a field that parsed, published, and was never written by
   * anything: 0 of the 41 rows of `run-mug776kx-0214b287` carried one, so its
   * 695 seconds stayed a single undivided gap. Optional the whole way down, so
   * a reader without one still orders by `iteration`.
   */
  at?: number;
  usage?: AutomationStudioLlmUsageSummary;
};
