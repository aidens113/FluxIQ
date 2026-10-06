/**
 * Core's plain words for why it did not do what a decision asked, written once
 * for every client's card and for Core's own wording
 * (`programs/automation-studio/runtime/activity/wording/draft-edit-card.ts`,
 * which checks at compile time that every reason the draft can give has words
 * here).
 *
 * - `amendment`: why an edit to the draft changed nothing, by the draft's own
 *   refusal reason (`programs/automation-studio/runtime/flow-draft/amendment/types.ts`).
 * - `repeated`: why a call, or a step asked to run again, was not run, by what
 *   the same call came to before (`programs/automation-studio/runtime/llm/repeat-guard/outcomes.ts`).
 *
 * Each finishes "Not done: ...", so each opens in lower case and is no code.
 */
export const ACTIVITY_ACTION_REFUSAL_WORDS = Object.freeze({
  amendment: Object.freeze({
    already_so: "the Flow already does that",
    act_already_named: "that step already does that",
    already_in_flow: "that step is already in the Flow",
    already_out: "that step is already out of the Flow",
    changes_nothing: "that step was already tried exactly this way on this same page, and trying it again would end the same way",
    no_such_step: "the Flow has no such step",
    no_such_position: "the Flow has no such place to move it to",
    not_a_kept_step: "the step it named is not in the Flow",
    did_not_work: "that step did not work, so it is not in the Flow",
    // "a repeat goes on what is done to each item, after the list it repeats
    // over" was no sentence a person could read (U-11, `run-muw60j7c-bb7c9a62`).
    over_not_before: "a repeat must start on a step that comes after the list it repeats over",
    no_step_before_it: "there is no step before it",
    run_by_the_loop: "that step could not be tried again this way",
    act_on_a_read: "that step only reads the page, so it cannot do the action",
    bind_not_a_binding: "a value can only be made to vary with a placeholder for it",
    bind_new_key: "that step has no such value to make vary",
    bind_row_outside_loop: "that step is not repeated for each item, so there is no item to take the value from",
    bind_malformed: "the placeholder for that value was not written correctly",
    rerun_holds_binding: "that step takes a value that varies, which is known only when the Flow runs",
    // Only beside an edit that moved a step, which changed the Flow, so a card
    // shows it as partly done at most; here because the reasons are exhaustive by type.
    repeat_taken_off: "moving a step left a repeat unable to run, so it was taken off",
    // A drop put back: it was the only step that brings the page to where a
    // step still in the Flow acted (`flow-draft/amendment/strand-check.ts`).
    strands_a_step: "that step is the only one that gets to the page a later step needs",
    // Not a refusal: said beside an edit that was applied, and never as "not
    // done"; here because the reasons are exhaustive by type.
    left_unreached: "a step now comes after one that does not get to the page it needs",
  } as const),
  repeated: Object.freeze({
    failed: "it was already tried exactly this way and did not work",
    changed_nothing: "it was already tried exactly this way and changed nothing",
    same_result: "it was already tried exactly this way, and trying it again would end the same way",
    same_answer: "it was already tried exactly this way, and trying it again would end the same way"
  } as const)
} as const);
