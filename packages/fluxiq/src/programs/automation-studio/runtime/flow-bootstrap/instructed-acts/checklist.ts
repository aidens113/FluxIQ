// The instructed acts as the model's own checklist, shown beside the draft from
// the first decision.
//
// **The defect this closes (audit A1, cause 1).** Core read the instruction's
// acts only inside the completion check, so the model first learned what "done"
// meant from a refusal: `bootstrap.instructed_act_missing` refused 304 of 401
// completions in the failed builds of 2026-09-29/30, was the last refusal in 35
// of 57 of them, and every build's first completion was refused
// `no_step_named` because the act ids existed nowhere else. So the same reading
// is shown every decision, as a list of what the person asked for with each
// act's state against the draft as it stands: `done` naming the step of the
// Flow that does it, or `todo` saying why nothing does yet.
//
// **Information, not a gate (t195).** The checklist is what the draft says
// about each act, for the model while it builds and for the judge after the
// test; it decides nothing. Whether the Flow does what it was told is decided
// by the test from the start and the judge of its actual results, and a
// completion is no longer refused for a todo here -- only for an act of a
// class a person is asked about that no step declares (`./permission.ts`).
// It reads the draft by the same loop as the check (`./standing.ts`), so the
// two say the same thing: live run 36 (`run-muq3uozx-3153564b`) showed a1 done
// while the check, judging only the first step naming it, said otherwise 24
// times. A step says which act it does when the model adds it (`act`). An act
// whose every named step only reads the page is `step_only_reads`.
//
// **The amendment a repeat needs travels with it.** An act `act_needs_repeat`
// or `span_stops_short` carries `after` (the step after the span), and the
// loop's own caller may add `repeatWith`, the one amendment that repeats it
// (`../../llm/harness-options/draft-acts.ts`): a suggestion, shown, never applied.
//
// **Each act's choices stand beside it (t208).** How many, and which size,
// colour or version (`./instruction-choices.ts`), are requirements the check
// holds a Flow to just as it holds it to the act, and until now the model met
// them only in a refusal, as `a2.quantity` in `missingActs`. So an act lists
// its choices under `choices`, each `done` naming the step that makes it or
// `todo` saying why nothing does, by the check's own rule: a kept step that
// says it makes the choice (`act: "a2.quantity"`), and not the act's own press
// unless that press was given the value (`./choice-evidence.ts`).
//
// **Which object, and how many (live run 40, `run-muq6lqnw-fdfa7aac`).** A step
// whose record names another act's object is `step_acts_on_another_object`,
// with `actsOn` naming that act, so the model sees which act its step does; a
// quantity named on a repeat over a list is `quantity_is_a_repeat`, and on
// presses of the add that are not the count, `quantity_presses_differ` with
// the `presses` counted (`./standing.ts`).
//
// Nothing here calls a provider or reads a page; it is the instruction's words
// and the draft.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftStepGoesToLocation } from "../reachability/index.ts";
import type { AutomationStudioInstructedChoice } from "./contracts.ts";
import { automationStudioInstructedActs } from "./instruction-acts.ts";
import { automationStudioInstructedActsStanding, type AutomationStudioInstructedStanding } from "./standing.ts";

/** Why an act on the checklist is not done yet. */
export type AutomationStudioInstructedActTodo =
  /** No step in the Flow says it does this act. */
  | "no_step_added"
  | "step_not_kept"
  | "step_changed_nothing"
  /** Every step that says it does this act only reads the page. */
  | "step_only_reads"
  | "step_only_arrives"
  | "step_is_optional"
  | "act_needs_repeat"
  | "span_stops_short"
  | "act_consequence_undeclared"
  /** A choice: the step said to make it is the act's own press, and nothing it was given sets the choice. */
  | "choice_is_the_act_step"
  /** A choice: the step said to make it already does another act, and nothing it was given sets the choice. */
  | "step_claimed_twice";

/**
 * Why an act or choice is not done, for the reasons read from what a step
 * acted on and how many times (`./object-binding.ts`, `./quantity-fault.ts`).
 * Held apart from `AutomationStudioInstructedActTodo`; a build's ending has a
 * plain clause for each of these too (`../unfinished-build/not-done.ts`). Like
 * every todo, they are information for the model and the judge, never a refusal.
 */
export type AutomationStudioInstructedActObjectTodo = "step_acts_on_another_object" | "quantity_is_a_repeat" | "quantity_presses_differ";

/** What the checklist adds to a todo it read from what a step acted on. */
type AutomationStudioInstructedTodoDetail = {
  /** `step_acts_on_another_object`: the id of the act whose object the step acted on. */
  actsOn?: string;
  /** `quantity_presses_differ`: the positions of the kept presses of the add. */
  presses?: number[];
  /** `span_stops_short`: the position of the step right after the repeat that does part of the act. */
  after?: number;
};

/** One choice of an act's item as the model is shown it: how many, or which size, colour or version. */
export type AutomationStudioInstructedChoiceChecklistItem = {
  /** The act's id and what it fixes: `a2.quantity`, `a2.size`. What a step names to say it makes it. */
  id: string;
  choice: AutomationStudioInstructedChoice["choice"];
  /** The person's own words for the value: `two`, `12 Double Rolls`. */
  value: string;
  quote: string;
  done?: number;
  todo?: AutomationStudioInstructedActTodo | AutomationStudioInstructedActObjectTodo;
  step?: number;
} & AutomationStudioInstructedTodoDetail;

/** One act as the model is shown it. */
export type AutomationStudioInstructedActChecklistItem = {
  id: string;
  verb: string;
  /** The person's own words for this act. */
  quote: string;
  plural?: true;
  /** The position of the step of the Flow that does it. */
  done?: number;
  /** Why no step does it yet, when none does. */
  todo?: AutomationStudioInstructedActTodo | AutomationStudioInstructedActObjectTodo;
  /** The step that says it does it but does not, when one does. */
  step?: number;
  /** The choices the person made for this act's item, each done or todo. Absent when they made none. */
  choices?: AutomationStudioInstructedChoiceChecklistItem[];
  /**
   * `act_needs_repeat` or `span_stops_short`: the one amendment that repeats
   * the act, in the draft's step numbers, and what it does. Only a suggestion,
   * added by a caller that can read the node library
   * (`../../llm/harness-options/draft-acts.ts`); never applied for the model.
   */
  repeatWith?: JsonObject;
  repeatSaid?: string;
} & AutomationStudioInstructedTodoDetail;

/** The checklist, or nothing when the instruction asks for no lasting act. */
export function automationStudioInstructedActsChecklist(input: {
  instructionText?: string | undefined;
  draftSteps: readonly AutomationStudioFlowDraftStep[];
  startLocation?: string | undefined;
}): AutomationStudioInstructedActChecklistItem[] | undefined {
  const acts = automationStudioInstructedActs(input.instructionText ?? "");
  if (!acts.length) return undefined;
  const startLocation = input.startLocation?.trim();
  const onlyArrives = (step: AutomationStudioFlowDraftStep): boolean =>
    startLocation ? automationStudioFlowBootstrapDraftStepGoesToLocation(step, startLocation) : false;
  const standing = automationStudioInstructedActsStanding({ acts, steps: input.draftSteps, onlyArrives });
  return acts.map((act) => {
    const item: AutomationStudioInstructedActChecklistItem = { id: act.id, verb: act.verb, quote: act.quote, ...(act.plural ? { plural: true as const } : {}), ...shown(standing.get(act.id)) };
    if (!act.requires?.length) return item;
    return { ...item, choices: act.requires.map((choice) => ({ id: choice.id, choice: choice.choice, value: choice.value, quote: choice.quote, ...shown(standing.get(choice.id)) })) };
  });
}

/** An act or choice as the checklist shows it: the step that does it, or why none does and the step judged. */
function shown(stood: AutomationStudioInstructedStanding | undefined): { done: number } | ({ todo: AutomationStudioInstructedActTodo | AutomationStudioInstructedActObjectTodo; step?: number } & AutomationStudioInstructedTodoDetail) {
  if (!stood) return { todo: "no_step_added" };
  if ("done" in stood) return { done: stood.done.position };
  return {
    todo: stood.reads ? "step_only_reads" : stood.fault,
    step: stood.step.position,
    ...(stood.after !== undefined ? { after: stood.after } : {}),
    ...(stood.actsOn !== undefined ? { actsOn: stood.actsOn } : {}),
    ...(stood.presses ? { presses: [...stood.presses] } : {})
  };
}

/** The ids of the acts and choices the checklist shows as not done, each act before its choices. */
export function automationStudioInstructedActsNotDone(items: readonly AutomationStudioInstructedActChecklistItem[] | undefined): string[] {
  return (items ?? []).flatMap((item) => [
    ...(item.done === undefined ? [item.id] : []),
    ...(item.choices ?? []).filter((choice) => choice.done === undefined).map((choice) => choice.id)
  ]);
}

/** The checklist as the draft entry carries it: compact, with no field it does not need. */
export function automationStudioInstructedActsChecklistValue(items: readonly AutomationStudioInstructedActChecklistItem[] | undefined): JsonObject[] | undefined {
  return items?.map(({ choices, repeatWith, ...item }) => ({
    ...item,
    ...(repeatWith ? { repeatWith: { ...repeatWith } } : {}),
    ...(choices ? { choices: choices.map((choice) => ({ ...choice })) } : {})
  }));
}
