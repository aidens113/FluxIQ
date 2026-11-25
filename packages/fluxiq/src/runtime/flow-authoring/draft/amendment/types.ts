// The shapes an amendment and its refusal travel in, shared by every module of
// this directory and by everything that reads a decision's answer.
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";
import type { AutomationStudioFlowDraftEditChange } from "./edits/index.ts";

/** One edit to one step of the draft: one of the seven edits (`./edits/`). */
export type AutomationStudioFlowDraftAmendment = {
  /** The step's position in the draft as the model was shown it, counting from 1. */
  step: number;
  change: AutomationStudioFlowDraftEditChange;
  /** Settings to carry on the step. Merged over whatever it already had, never over what it ran with (`./settings-rewrite-run.ts`). */
  settings?: JsonObject;
  /**
   * `rerun`: what changes in the argument the step ran with, as a JSON merge
   * patch (`../../../llm/rerun-arguments/`). `bind`: the parameters to
   * lift, each set to a binding form (`../binding-forms.ts`), the `parameters`
   * wrapper optional.
   */
  input?: JsonObject;
  /** `repeat` only: the last step of the span that repeats. Defaults to this step. */
  through?: number;
  /** `repeat` only: the step whose rows, or whose success, the span repeats on. Defaults to the step before it. */
  over?: number;
  /**
   * `repeat` only, never with `over`: the span's last step, which runs on
   * every pass; the span runs again while it succeeds (`../routing.ts`). It is
   * `through`, which defaults to it.
   */
  while?: number;
  /**
   * `repeat` with `while`: the most passes, 1 to 500, and only a count the
   * person's own instruction gives -- a while-loop ends when its last step
   * answers ended, never at a bound, and one with neither is refused as it is
   * written (`repeat_never_ends`). With a repeat over a listing: act on only
   * its first N rows, 1 to 10,000.
   */
  most?: number;
  /**
   * `keep` only: the instructed act (`a1`, `a2` ...) this step does,
   * as the checklist beside the draft names it. Recorded on the step, and read
   * as the model's claim when it completes (`../step.ts`, `acts`). Only a step
   * whose effect is `mutate` does an act; one named on a read is not recorded
   * there, the rest of the amendment is applied, and the model is told why
   * (`act_on_a_read`).
   */
  act?: string;
  /**
   * `keep` only: the places on the route the person named this step
   * is on (`r1`, `"r1,r2"`, or `none`; `../route-places/place-value.ts`),
   * replacing the step's own and never another step's (`../step.ts`,
   * `places`). D phase 2. Taken on a read too, since a listing may be on the
   * way; ignored outside that grammar, as a bad `act` id is; and, saying only
   * what the step already says, refused `already_so`. A `keep` carrying it
   * clears no condition, as one carrying `act` does not.
   */
  place?: string;
};

/**
 * Why one amendment changed nothing -- or, for `act_on_a_read` and
 * `act_not_done_there`, the one part of it that was not done: the act a read
 * cannot do, or the act the judge says the step does not do, beside the rest,
 * which was.
 */
export type AutomationStudioFlowDraftAmendmentRefusal = {
  step: number;
  reason: "no_such_step" | "already_so" | "no_such_position" | "run_by_the_loop" | "no_step_before_it" | "over_not_before" | "not_a_kept_step" | "did_not_work" | "already_in_flow" | "already_out" | "changes_nothing" | "act_on_a_read" | "act_already_named"
    | "bind_not_a_binding" | "bind_new_key" | "bind_row_outside_loop" | "bind_malformed" | "rerun_holds_binding"
    | "strands_a_step" | "settings_rewrite_run" | "second_copy" | "act_not_done_there" | "repeat_never_ends" | "holds_a_repeat" | "span_holds_routing"
    /** `result` on a step that is not a read (`./edits/result.ts`). */
    | "not_a_read";
  /**
   * `over_not_before` only: the step the repeat named as `over`, so the
   * telling can say, in the draft's numbers, which step lists the rows and
   * what a loop over them still needs (`../../llm/draft-amendment-feedback/index.ts`).
   * Live run 37 (`run-muq5v4zg-39182b58`) sent `13 repeat over 13` on its
   * filtered listing with no press after it, and was told the rule in general.
   */
  over?: number;
  /**
   * `over_not_before` only, when `over` came after the act and the repeat named
   * a `through`: that step (live run `run-murz83zy-5030820f`, R8).
   * `span_holds_routing`: the last step of the span that
   * holds the second routed step (`./repeat-hold.ts`, t981).
   */
  through?: number;
  /**
   * `holds_a_repeat` and `span_holds_routing` only (`./repeat-hold.ts`, t981):
   * the step carrying the repeat -- the one whose `over` or span's last step
   * the refused drop or exploratory was, or the one whose span the refused
   * routing would leave holding a second routed step -- in the draft's shown
   * numbers.
   */
  repeat?: number;
  /**
   * `holds_a_repeat` only: which part of that repeat the step is -- `over`,
   * the step it repeats over, or `through`, the last step of its span.
   */
  holds?: "over" | "through";
  /** `holds_a_repeat` only: that repeat runs its span again while its last step succeeds, so its last step is named by `while`. */
  whileLoop?: true;
  /**
   * `span_holds_routing` only: the step inside the span that says when it runs
   * as well as the span's first step, in the draft's shown numbers. It is the
   * refused step itself when the refused routing was written inside the span.
   */
  routed?: number;
  /**
   * `act_already_named` only: the act the amendment named, so the telling can
   * say whether the checklist already shows it done and, when it does, which
   * acts are still to do (`../../llm/draft-amendment-feedback/index.ts`). Live run
   * `run-muqiojz4-04a7a8fc` named `a2.quantity` on its step five decisions
   * running while the checklist showed it done and `a3` still to do.
   * `act_not_done_there`: the act whose claim was refused.
   */
  act?: string;
  /**
   * `act_not_done_there`: the act judge's sentence for the step -- what it did
   * instead of the act, and where to name the act -- the same sentence the
   * checklist says as `todoSaid`
   * (`../../flow-bootstrap/instructed-acts/claim-verdict.ts`, week report W1).
   * `repeat_never_ends`: assembly's own sentence for the loop -- why its last
   * step cannot end it, the library's nodes that can, and the amendments that
   * fix it -- the same one the Flow would be refused with
   * (`AutomationStudioFlowDraftLoopNeverEnds`).
   */
  said?: string;
  /**
   * `act_not_done_there` only, when the draft has one: the step whose words
   * name the act, where the claim belongs, in the draft's shown numbers.
   */
  instead?: number;
  /**
   * `bind_*` only: the dotted path of the parameter the refusal is about,
   * under the step's parameters, in the model's own key names.
   */
  parameter?: string;
  /**
   * `bind_new_key` only: the parameter is one the draft shows -- what the step
   * was written with -- but not a value it ran with: the control it acted on,
   * which the domain found by its words and ran as something else (a press's
   * `target`, run as a selector). Live run `run-musp4h2f-72e8ed99` bound the
   * `target` of its size press, as the draft showed it, and was told to name
   * "a parameter it already has, as the draft shows it" -- which it had, four
   * decisions running. The telling says a press has no value to vary
   * (`../../llm/draft-amendment-feedback/index.ts`); the code stays, since the chat
   * wording is keyed by it.
   */
  control?: true;
  /**
   * `bind_new_key` only: the dotted parameter paths the step does offer bind
   * (`../bindable/paths.ts`), read from the step the bind examined -- never a
   * number looked up again after the decision moved steps -- and never a
   * private value its argument resolved to. Live run B7 (t262) bound a click's
   * shown `target` five times and was told only to name a parameter it has.
   */
  bindable?: string[];
  /**
   * The step the amendment named is the attempt a rerun replaced: the number of
   * the step standing in its place, so the telling can say to change that one
   * instead (`../../llm/draft-amendment-feedback/index.ts`, live run
   * `run-musp474o-e0ed7432`). Refused under `./replaced-attempt.ts`'s reason.
   */
  replacedBy?: number;
  /**
   * `strands_a_step` only: a `drop` refused because the step was the last step of
   * the Flow that moved the target to the page a kept step acted on: that kept
   * step, in the draft's shown numbers (`./strand-check.ts`, live run
   * `run-muwao5n4-44977b2a`, D2-1).
   */
  strands?: number;
  /**
   * `second_copy` only: a `keep` refused because the step it would
   * bring into the Flow copies a step already in it -- the same press on the
   * same page, or a read of the same list with nothing changed in between --
   * and this is that step, in the draft's shown numbers (`../second-copy.ts`,
   * live run `run-murwdp4f-35f976d2`, C9).
   */
  copyOf?: number;
};

/** A claim of an act refused as it is made: the act, the judge's sentence, and the step that names the act, when there is one. */
export type AutomationStudioFlowDraftClaimRefusal = { act: string; said: string; instead?: number | undefined };

/**
 * Asked before an act is claimed on a step: the refusal when the act judge
 * would reject the claim, or nothing when it stands
 * (`../../llm/harness-options/draft-acts.ts`, built on
 * `../../flow-bootstrap/instructed-acts/claim-verdict.ts`). Week report W1:
 * live run `run-mux74k5q-1c3c2127` put a1 on the press of "Spain", one of a1's
 * own options, and was answered "applied". `instead` is a position in `steps`
 * as they stand when it is asked.
 */
export type AutomationStudioFlowDraftClaimRefused = (
  steps: readonly AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep,
  act: string
) => AutomationStudioFlowDraftClaimRefusal | undefined;

/**
 * Not a refusal: a step of the Flow an applied decision newly left after a step
 * that does not leave the target on the page it acted on, so when the Flow runs
 * it runs on another page (`./strand-check.ts`, live run
 * `run-muwao5n4-44977b2a`, D2-1). Returned beside `refused`, never in it, so
 * nothing that counts refusals counts it. `step` is the step, `after` the step
 * before it in the Flow now, and `reachedBy` the steps that moved the target to
 * its page while exploring (possibly none), all in the draft's shown numbers.
 */
export type AutomationStudioFlowDraftUnreachedStep = { step: number; after: number; reachedBy: number[] };

/**
 * Asked when an amendment writes a repeat that runs its span again while the
 * span's last step succeeds: assembly's own refusal of that loop, as the Flow
 * would be refused with it, or nothing when it stands. A loop ends when its
 * last step answers ended because there is nothing more; a last step whose
 * node can answer no such route, with no `most` the person gave, would end
 * only by failing, and is refused as it is written (`repeat_never_ends`)
 * rather than at assembly, after the answer, where the model never saw it
 * (`../../llm/harness-options/draft-acts.ts`, run `run-mwblz4aq-0baa810a`).
 * `step` is the step carrying the repeat, in `steps` as they stand when it is
 * asked; the sentence names steps by their `position` there.
 */
export type AutomationStudioFlowDraftLoopNeverEnds = (
  steps: readonly AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep
) => string | undefined;
