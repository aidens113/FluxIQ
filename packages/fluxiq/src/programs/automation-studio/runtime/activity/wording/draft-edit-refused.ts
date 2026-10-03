import type { AutomationStudioFlowDraftAmendmentRefusal } from "../../flow-draft/index.ts";
import { automationStudioActivityReasonText } from "./reason-text.ts";

/**
 * Why an edit to the draft changed nothing, in a person's words, by the
 * draft's own refusal reason (`../../flow-draft/amendment.ts`). Exhaustive by
 * type, so a reason added there fails to compile until it is said here.
 */
const BECAUSE: Readonly<Record<AutomationStudioFlowDraftAmendmentRefusal["reason"], string>> = Object.freeze({
  already_so: "the Flow already does that",
  act_already_named: "that step already does that",
  already_in_flow: "that step is already in the Flow",
  already_out: "that step is already out of the Flow",
  changes_nothing: "that step already ran exactly this way, and running it again would give the same result",
  no_such_step: "the Flow has no such step",
  no_such_position: "the Flow has no such place to move it to",
  not_a_kept_step: "the step it named is not in the Flow",
  did_not_work: "that step did not work, so it is not in the Flow",
  over_not_before: "a repeat goes on what is done to each item, after the list it repeats over",
  no_step_before_it: "there is no step before it",
  run_by_the_loop: "that step could not be tried again this way",
  act_on_a_read: "that step only reads the page, so it cannot do the action",
  bind_not_a_binding: "a value can only be made to vary with a placeholder for it",
  bind_new_key: "that step has no such value to make vary",
  bind_row_outside_loop: "that step is not repeated for each item, so there is no item to take the value from",
  bind_malformed: "the placeholder for that value was not written correctly",
  rerun_holds_binding: "that step takes a value that varies, which is known only when the Flow runs"
});

/** The reasons that refuse only a step asked to run again, so the card says the step was not run again. */
const RERUN_REASONS: ReadonlySet<string> = new Set(["changes_nothing", "rerun_holds_binding"]);

/** What an earlier run of the same call came to (`../../llm/repeat-guard/outcomes.ts`), said as why it was not run again. */
const REPEATED: Readonly<Record<string, string>> = Object.freeze({
  failed: "it already ran exactly this way and did not work",
  changed_nothing: "it already ran exactly this way and changed nothing",
  same_result: "it already ran exactly this way, and running it again would give the same result",
  same_answer: "it already ran exactly this way, and running it again would give the same result"
});

const upperFirst = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
const lowerFirst = (text: string): string => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

/**
 * The card for an edit to the draft that changed nothing: a title saying so
 * ("Didn't change the Flow", or "Didn't run the step again" for a step asked to
 * run again unchanged) and why, followed by what the edit meant to do in the
 * model's own words (`summary`, held to what the chat may show). Never a code:
 * a reason with no words here is left out, and the title still says nothing
 * changed.
 *
 * `refusal` is either the draft's reasons for the edit, or how the earlier run
 * of a step asked to run again ended (`repeated`).
 */
export function automationStudioActivityDraftEditRefused(
  refusal: { reasons: readonly string[] } | { repeated: string },
  summary: string | undefined
): { title: string; text: string } {
  const rerun = "repeated" in refusal || (refusal.reasons.length > 0 && refusal.reasons.every((reason) => RERUN_REASONS.has(reason)));
  const said = "repeated" in refusal
    ? [REPEATED[refusal.repeated] ?? REPEATED.same_result!]
    : [...new Set(refusal.reasons.map((reason) => (BECAUSE as Readonly<Record<string, string>>)[reason]).filter((words): words is string => Boolean(words)))].slice(0, 2);
  const title = rerun ? "Didn't run the step again" : "Didn't change the Flow";
  const meant = automationStudioActivityReasonText(summary);
  const why = said.length ? upperFirst(said.join("; and ")) : rerun ? "It was not run again" : "The Flow is as it was";
  return { title, text: meant ? `${why}, so this was not done: ${lowerFirst(meant)}` : `${why}.` };
}
