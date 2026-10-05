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
//
// The recorder every row enters the record through is declared here too
// (`automationStudioLlmEvidenceLoopTraceRecorder`), beside the row it writes:
// it stamps each row with the draft its decision was shown, its progress and
// its moment, which is what the row's last members are. It was the opening
// sixty lines of the coordinator's loop body until that file passed Core's
// 800-line limit (t226).

import { AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID, type AutomationStudioFlowDraftAmendmentRefusal } from "../../flow-draft/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceRowTransition } from "../decision-handlers/index.ts";
import type { AutomationStudioLlmUsageSummary } from "../harness.ts";
import type { AutomationStudioLlmEvidenceLoopAnswerability } from "./answerability.ts";
import type { AutomationStudioLlmEvidenceRestoredStep } from "./completion-check.ts";
import type { AutomationStudioLlmEvidenceLoopDraftChange } from "./draft-change.ts";
import type { AutomationStudioLlmEvidenceLoopDraftShown } from "./draft-shown.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID, type AutomationStudioLlmEvidenceLoopProgress } from "../evidence-progress/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID } from "../draft-amendment-feedback.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID } from "../repeat-guard/index.ts";
import { automationStudioLlmStepLogAnswer, type AutomationStudioLlmStepLogAnswerStep, type AutomationStudioLlmStepLogCoreEntry } from "../step-log/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID } from "../unusable-decision.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID } from "./answered-request.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID } from "./completion-check.ts";

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

/** The loop's record as it is written: the one door every row goes through, and what that door remembers between rows. */
export type AutomationStudioLlmEvidenceLoopTraceRecorder = {
  /**
   * What this iteration's decision was shown of the draft, stamped onto every
   * row the iteration records (`./draft-shown.ts`).
   *
   * Here for the same reason the moment below is: a row that says what the model
   * was looking at is a property of the loop rather than a rule someone has to
   * remember at each of the five push sites. It is cleared at the top of every
   * iteration, so a row carries the draft of the decision it belongs to or
   * nothing at all -- and nothing is the honest answer for the rows recorded
   * before the first decision, which were shown no draft.
   */
  draftShown: AutomationStudioLlmEvidenceLoopDraftShown | undefined;
  /**
   * A new decision is about to be asked: clears `draftShown`, and completes the
   * answer steps the last decision left with what Core showed the model about
   * them since (`../step-log/answer-step.ts`) -- an unusable decision's check
   * and a redirect are shown after its row is recorded, and before the next
   * decision is the moment everything said about it has been said.
   */
  decisionStarts(): void;
  /** The draft's revision: one more for every recorded row whose transition changed the draft. */
  readonly draftRevision: number;
  /** The capability facts the latest row that observed any carried, which the next such row is compared against. */
  readonly answerability: AutomationStudioLlmEvidenceLoopAnswerability | undefined;
  /**
   * One row of the record, stamped with the moment it was recorded.
   *
   * **Every row goes through here, which is the point of it existing.** The
   * stamp was declared downstream and emitted nowhere, so a build's rows
   * carried no moment at all and a reader could only see one undivided gap:
   * `run-mug776kx-0214b287` spent 695 seconds over 41 rows and not one of them
   * said when it happened, so a step that took ten minutes could not be told
   * from forty that took seventeen seconds each. Stamping at the push rather
   * than at each row's construction is what makes "every row has one" a
   * property of the loop instead of a rule someone has to remember at the next
   * push site.
   *
   * `Date.now()` and not the budget's clock: this is a wall-clock moment for a
   * person reading the record afterwards, while `input.budget.now` is an
   * elapsed-time source a caller may drive itself.
   */
  record(row: AutomationStudioLlmEvidenceLoopTrace, transition?: AutomationStudioLlmEvidenceRowTransition): void;
};

/**
 * The evidence entries in which Core answers a decision itself, as opposed to a
 * tool's result, a page, the budget or the draft: what an answer step carries
 * as the feedback the model was shown.
 */
const CORE_ANSWER_TOOL_IDS: ReadonlySet<string> = new Set([
  AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID,
  AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID,
  AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID,
  AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID,
  AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID,
  AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID,
  AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID
]);

/**
 * The recorder that writes a loop's rows into `trace`, which the loop hands on
 * as its record. A row Core answered without running a tool -- an amendment, a
 * call refused as a repeat or answered from memory, a decision refused as
 * unusable -- is also written to the step log as Core's answer
 * (`../step-log/answer-step.ts`) when `env` turns the step log on, carrying
 * the entries of Core's own (`CORE_ANSWER_TOOL_IDS`) that `evidence` gained
 * since its decision was asked. The feedback is read from the evidence rather
 * than carried on the row, so the record a build stores and publishes is
 * unchanged, and so is the order in which the loop tells the model things.
 */
export function automationStudioLlmEvidenceLoopTraceRecorder(
  trace: AutomationStudioLlmEvidenceLoopTrace[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  evidence: () => ReadonlyArray<AutomationStudioLlmStepLogCoreEntry> = () => []
): AutomationStudioLlmEvidenceLoopTraceRecorder {
  let draftRevision = 0;
  let previousAnswerability: AutomationStudioLlmEvidenceLoopAnswerability | undefined;
  // The call ids the evidence held when the current decision was asked, and the answers it has had so far.
  let heldBefore: ReadonlySet<string> = new Set();
  let answers: AutomationStudioLlmStepLogAnswerStep[] = [];
  const coreAnswers = (): AutomationStudioLlmStepLogCoreEntry[] => evidence().filter((entry) => CORE_ANSWER_TOOL_IDS.has(entry.toolId) && !heldBefore.has(entry.callId));
  const recorder: AutomationStudioLlmEvidenceLoopTraceRecorder = {
    draftShown: undefined,
    decisionStarts: () => {
      recorder.draftShown = undefined;
      if (answers.length) {
        const shown = coreAnswers();
        for (const answer of answers) answer.shown(shown);
        answers = [];
      }
      heldBefore = new Set(evidence().map((entry) => entry.callId));
    },
    get draftRevision() { return draftRevision; },
    get answerability() { return previousAnswerability; },
    // A closure over `recorder` rather than `this`, so the loop may hand it on detached.
    record: (row, transition = {}) => {
      const draftRevisionBefore = draftRevision;
      if (transition.draftChanged) draftRevision += 1;
      const answerabilityState: AutomationStudioLlmEvidenceLoopProgress["answerabilityState"] = !transition.answerability
        ? "unobserved"
        : !previousAnswerability
          ? "first_observed"
          : sameAnswerability(previousAnswerability, transition.answerability) ? "unchanged" : "changed";
      if (transition.answerability) previousAnswerability = transition.answerability;
      const progress: AutomationStudioLlmEvidenceLoopProgress = {
        draftRevisionBefore,
        draftRevisionAfter: draftRevision,
        pageState: transition.pageState ?? "unobserved",
        draftState: transition.draftChanged ? "changed" : "unchanged",
        answerabilityState
      };
      const draftShown = recorder.draftShown;
      trace.push({
        ...row,
        ...(draftShown ? { draft: draftShown } : {}),
        progress,
        ...(transition.draftChange ? { draftChange: transition.draftChange } : {}),
        ...(transition.answerability ? { answerability: transition.answerability } : {}),
        at: Date.now()
      });
      const answer = automationStudioLlmStepLogAnswer(trace[trace.length - 1]!, env, undefined, coreAnswers);
      if (answer) answers.push(answer);
    }
  };
  return recorder;
}

function sameAnswerability(left: AutomationStudioLlmEvidenceLoopAnswerability, right: AutomationStudioLlmEvidenceLoopAnswerability): boolean {
  return left.recordsRequested === right.recordsRequested
    && left.recordProducerPresent === right.recordProducerPresent
    && left.recordStorePresent === right.recordStorePresent
    && left.issueCode === right.issueCode;
}
