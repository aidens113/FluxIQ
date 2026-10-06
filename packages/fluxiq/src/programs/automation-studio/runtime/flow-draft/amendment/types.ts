// The shapes an amendment and its refusal travel in, shared by every module of
// this directory and by everything that reads a decision's answer.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftAmendmentChange } from "./changes.ts";

/** One edit to one step of the draft. */
export type AutomationStudioFlowDraftAmendment = {
  /** The step's position in the draft as the model was shown it, counting from 1. */
  step: number;
  change: AutomationStudioFlowDraftAmendmentChange;
  /** Settings to carry on the step. Merged over whatever it already had. */
  settings?: JsonObject;
  /**
   * The position of another step, counting from 1.
   *
   * `reorder`: where to move this step to. `on_failed`: the step to run when
   * this one fails. One key for one meaning -- "the other step this change is
   * about" -- because two spellings of the same idea is a grammar the model has
   * to remember rather than one it can guess.
   */
  to?: number;
  /**
   * `rerun`: what changes in the argument the step ran with, as a JSON merge
   * patch (`../../llm/evidence-loop/rerun-input.ts`). `bind`: the parameters to
   * lift, each set to a binding form (`../binding-forms.ts`), the `parameters`
   * wrapper optional.
   */
  input?: JsonObject;
  /** `only_if` only: the step whose success this one runs on. Defaults to the step before it. */
  check?: number;
  /** `repeat` only: the last step of the span that repeats. Defaults to this step. */
  through?: number;
  /** `repeat` only: the step whose rows, or whose success, the span repeats on. Defaults to the step before it. */
  over?: number;
  /**
   * `add` or `keep` only: the instructed act (`a1`, `a2` ...) this step does,
   * as the checklist beside the draft names it. Recorded on the step, and read
   * as the model's claim when it completes (`../step.ts`, `acts`). Only a step
   * whose effect is `mutate` does an act; one named on a read is not recorded
   * there, the rest of the amendment is applied, and the model is told why
   * (`act_on_a_read`).
   */
  act?: string;
  /**
   * `add` or `keep` only: the places on the route the person named this step
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
 * Why one amendment changed nothing -- or, for `act_on_a_read`, the one part of
 * it that was not done: the act a read cannot do, beside the rest, which was;
 * or, for `repeat_taken_off`, a repeat the decision's moves left unable to run.
 */
export type AutomationStudioFlowDraftAmendmentRefusal = {
  step: number;
  reason: "no_such_step" | "already_so" | "no_such_position" | "run_by_the_loop" | "no_step_before_it" | "over_not_before" | "not_a_kept_step" | "did_not_work" | "already_in_flow" | "already_out" | "changes_nothing" | "act_on_a_read" | "act_already_named"
    | "bind_not_a_binding" | "bind_new_key" | "bind_row_outside_loop" | "bind_malformed" | "rerun_holds_binding" | "repeat_taken_off";
  /**
   * `over_not_before` only: the step the repeat named as `over`, so the
   * telling can say, in the draft's numbers, which step lists the rows and
   * what a loop over them still needs (`../../llm/draft-amendment-feedback.ts`).
   * Live run 37 (`run-muq5v4zg-39182b58`) sent `13 repeat over 13` on its
   * filtered listing with no press after it, and was told the rule in general.
   * `repeat_taken_off`: the step the repeat taken off was over.
   */
  over?: number;
  /**
   * `over_not_before` only, when `over` came after the act and the repeat named
   * a `through`: that step, so the telling can say where it stands once the
   * listing is moved before the act (live run `run-murz83zy-5030820f`, R8).
   * `repeat_taken_off`, when the span no longer holds together: the step its
   * span ran through.
   */
  through?: number;
  /**
   * `repeat_taken_off` only: why the repeat on `step`, over `over`, could not
   * stand once the decision's moves were done -- `over_after`, the step it
   * repeated over no longer runs before it; `span_broken`, the step its span
   * ran `through` now runs before it. Every number on such a refusal is the
   * one the draft shown numbered the step; `now`, `overNow` and `throughNow`
   * give the draft's number for it after the decision, where it changed.
   * Not an amendment refused: a repeat the decision's moves left unable to
   * run (live run `run-musr9pv3-f4bf6256`, `./repeat-revalidation.ts`).
   */
  takenOff?: "over_after" | "span_broken";
  /** `repeat_taken_off` only: the number of `step` after the decision, where it changed. */
  now?: number;
  /** `repeat_taken_off` only: the number of `over` after the decision, where it changed. */
  overNow?: number;
  /** `repeat_taken_off` only: the number of `through` after the decision, where it changed. */
  throughNow?: number;
  /**
   * `act_already_named` only: the act the amendment named, so the telling can
   * say whether the checklist already shows it done and, when it does, which
   * acts are still to do (`../../llm/draft-amendment-feedback.ts`). Live run
   * `run-muqiojz4-04a7a8fc` named `a2.quantity` on its step five decisions
   * running while the checklist showed it done and `a3` still to do.
   */
  act?: string;
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
   * (`../../llm/draft-amendment-feedback.ts`); the code stays, since the chat
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
   * instead (`../../llm/draft-amendment-feedback.ts`, live run
   * `run-musp474o-e0ed7432`). Refused under `./replaced-attempt.ts`'s reason.
   */
  replacedBy?: number;
};
