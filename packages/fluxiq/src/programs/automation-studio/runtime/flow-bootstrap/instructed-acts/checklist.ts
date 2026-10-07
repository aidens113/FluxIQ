import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../llm/harness-options/index.ts";
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
// **A choice made after its act (live run `run-murwdp4f-35f976d2`, C2).** A
// choice done by a step after the step that does its act stays done, and
// carries `afterAct` (that step) and `afterActSaid`: the act ran before its
// choice. This is the channel that reaches the model on every decision
// (`../../llm/harness-options/draft-acts.ts`) and the judge of the build's test
// (`buildTest.checklist`); never a todo (`./choice-order.ts`).
// **A step that does a plural act to one row, beside the repeat (live run
// `run-murz83zy-5030820f`, R10).** The last draft kept step 6, a Confirm done
// once on one card, beside step 13, the Confirm repeated over the listing at
// step 7, and showed a1 done by 13 and nothing about 6: playback would have
// accepted that one request whatever it was. So a plural act whose step is
// repeated lists under `drop` every kept step that does it to one row, with
// `dropSaid` saying, in the draft's numbers, to drop them (`singleRowSteps`).
// A field of its own beside `done`, not a todo: the act is done, the check and
// the completion gate are unchanged, and a build's ending words every todo
// (`../unfinished-build/not-done.ts`).
//
// **What the step did instead (W1, 23 live runs; `./act-evidence.ts`).** An
// act claimed on a step whose record shows it chose one of the act's options
// (`step_only_chooses`, `chooses`), only cleared a layer in front of the page
// (`step_only_clears_the_way`), went to another page (`step_only_arrives`),
// only opened the page of its choices (`step_only_opens_its_choices`), or
// changed nothing that shows the act while another step's change does
// (`another_step_shows_it`) carries `todoSaid`: what that step did, that it
// does not do the act, and where to name the act -- the step whose change
// shows it or whose words name it (`instead`), or the press to run. That
// verdict replaces the advisory `claimSaid` for these five, and a step whose
// change shows the act carries no `claimSaid` either: what it changed answers
// the doubt about its words. The three new reasons are their own union
// (`AutomationStudioInstructedActEvidenceTodo`), so a reader typed over the
// other two falls back safely.
//
// Nothing here calls a provider or reads a page; it is the instruction's words
// and the draft.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepById, automationStudioFlowDraftStepIsProposed } from "../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftStepGoesToLocation } from "../reachability/index.ts";
import { automationStudioInstructedActChangeShows, automationStudioInstructedActEvidenceSaid, automationStudioInstructedActIsEvidenceFault } from "./act-evidence.ts";
import { automationStudioInstructedChoiceAfterAct } from "./choice-order.ts";
import { automationStudioInstructedActClaimDoubt } from "./claim-doubt.ts";
import type { AutomationStudioInstructedAct, AutomationStudioInstructedChoice } from "./contracts.ts";
import { automationStudioInstructedActs } from "./instruction-acts.ts";
import { automationStudioInstructedChoiceValueSaid } from "./instruction-choices.ts";
import { automationStudioInstructedActRepeatSpans } from "./span.ts";
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
  /** The step said to do it only opened the page where its choices are made (`./standing.ts`). */
  | "step_only_opens_its_choices"
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

/**
 * Why an act is not done, read from what the step claimed for it did instead
 * (`./act-evidence.ts`): it made one of the act's own choices, only cleared a
 * layer in front of the page, or changed nothing that shows the act while
 * another step's change does. Held apart from the two unions above, so a
 * reader typed over those falls back safely. Information on the checklist; a
 * claim is refused for it only as it is made (`./claim-verdict.ts`).
 */
export type AutomationStudioInstructedActEvidenceTodo = "step_only_chooses" | "step_only_clears_the_way" | "another_step_shows_it";

/** Every reason an act or choice on the checklist is not done. */
type Todo = AutomationStudioInstructedActTodo | AutomationStudioInstructedActObjectTodo | AutomationStudioInstructedActEvidenceTodo;

/** What the checklist adds to a todo it read from what a step acted on. */
type AutomationStudioInstructedTodoDetail = {
  /** `step_acts_on_another_object`: the id of the act whose object the step acted on. */
  actsOn?: string;
  /** `quantity_presses_differ`: the positions of the kept presses of the add. */
  presses?: number[];
  /** `span_stops_short`: the position of the step right after the repeat that does part of the act. */
  after?: number;
  /** `step_only_chooses`: the id of the act's own choice the step made instead. */
  chooses?: string;
  /** The position of a step whose change shows the act or whose words name it, for a step judged to have done something else (`./act-evidence.ts`). */
  instead?: number;
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
  todo?: Todo;
  step?: number;
  /** The position of the step that does this choice's act, when it comes before the step that makes the choice (`./choice-order.ts`). */
  afterAct?: number;
  /** What that means, in words the model and the judge act on. Information, never a todo. */
  afterActSaid?: string;
  /** For a time asked for by its rank, which one that is (`./instruction-choices.ts`, `automationStudioInstructedChoiceValueSaid`). */
  valueSaid?: string;
} & AutomationStudioInstructedTodoDetail;

/** One act as the model is shown it. */
export type AutomationStudioInstructedActChecklistItem = {
  id: string;
  verb: string;
  /** The person's own words for this act. */
  quote: string;
  /** Possible control/claim mismatch for model and judge review; preserves coverage and whole-Flow authority. */
  claimSaid?: string;
  plural?: true;
  /** The position of the step of the Flow that does it. */
  done?: number;
  /** Why no step does it yet, when none does. */
  todo?: Todo;
  /**
   * `step_only_chooses`, `step_only_clears_the_way`, `step_only_arrives`,
   * `step_only_opens_its_choices` and `another_step_shows_it`: what the step
   * did, that it does not do the act, and where to name it
   * (`./act-evidence.ts`). Replaces `claimSaid`.
   */
  todoSaid?: string;
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
  /**
   * A plural act whose step is repeated: the kept steps that do it to one row
   * instead, and the sentence saying to drop them (`singleRowSteps`).
   * Information beside `done`, never a todo.
   */
  drop?: number[];
  dropSaid?: string;
} & AutomationStudioInstructedTodoDetail;

/** The checklist, or nothing when the instruction asks for no lasting act. */
export function automationStudioInstructedActsChecklist(input: {
  instructionText?: string | undefined;
  draftSteps: readonly AutomationStudioFlowDraftStep[];
  startLocation?: string | undefined;
  arrival?: NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["runsNodes"]>["arrival"] | undefined;
}): AutomationStudioInstructedActChecklistItem[] | undefined {
  const acts = automationStudioInstructedActs(input.instructionText ?? "");
  if (!acts.length) return undefined;
  const startLocation = input.startLocation?.trim();
  const onlyArrives = (step: AutomationStudioFlowDraftStep): boolean =>
    startLocation ? automationStudioFlowBootstrapDraftStepGoesToLocation(step, startLocation, input.arrival) : false;
  const standing = automationStudioInstructedActsStanding({ acts, steps: input.draftSteps, onlyArrives });
  return acts.map((act) => {
    const stood = standing.get(act.id);
    const doer = stood ? ("done" in stood ? stood.done : stood.step) : undefined;
    const once = act.plural && doer ? singleRowSteps(act.id, doer, input.draftSteps) : undefined;
    const todoSaid = evidenceSaid(act, stood, input.draftSteps);
    // The verdict on what the step did, or a change of it that shows the act, replaces the doubt about its words.
    const claimSaid = doer && todoSaid === undefined && !automationStudioInstructedActChangeShows(act, doer)
      ? automationStudioInstructedActClaimDoubt(act, doer, input.draftSteps)
      : undefined;
    const item: AutomationStudioInstructedActChecklistItem = {
      id: act.id, verb: act.verb, quote: act.quote, ...(act.plural ? { plural: true as const } : {}), ...shown(stood),
      ...(todoSaid !== undefined ? { todoSaid } : {}),
      ...(claimSaid ? { claimSaid } : {}),
      ...(once ? { drop: once.drop, dropSaid: once.said } : {})
    };
    if (!act.requires?.length) return item;
    return {
      ...item,
      choices: act.requires.map((choice) => {
        const valueSaid = automationStudioInstructedChoiceValueSaid(choice);
        return { id: choice.id, choice: choice.choice, value: choice.value, quote: choice.quote, ...shown(standing.get(choice.id)), ...madeAfterAct(choice, standing.get(choice.id)), ...(valueSaid ? { valueSaid } : {}) };
      })
    };
  });
}

/** An act or choice as the checklist shows it: the step that does it, or why none does and the step judged. */
function shown(stood: AutomationStudioInstructedStanding | undefined): { done: number } | ({ todo: Todo; step?: number } & AutomationStudioInstructedTodoDetail) {
  if (!stood) return { todo: "no_step_added" };
  if ("done" in stood) return { done: stood.done.position };
  return {
    todo: stood.reads ? "step_only_reads" : stood.fault,
    step: stood.step.position,
    ...(stood.after !== undefined ? { after: stood.after } : {}),
    ...(stood.actsOn !== undefined ? { actsOn: stood.actsOn } : {}),
    ...(stood.presses ? { presses: [...stood.presses] } : {}),
    ...(stood.chooses !== undefined ? { chooses: stood.chooses } : {}),
    ...(stood.instead !== undefined ? { instead: stood.instead } : {})
  };
}

/** For an act judged to have been claimed on a step that did something else, the sentence saying so (`./act-evidence.ts`). */
function evidenceSaid(act: AutomationStudioInstructedAct, stood: AutomationStudioInstructedStanding | undefined, steps: readonly AutomationStudioFlowDraftStep[]): string | undefined {
  if (!stood || !("fault" in stood) || stood.reads || !automationStudioInstructedActIsEvidenceFault(stood.fault)) return undefined;
  return automationStudioInstructedActEvidenceSaid({ act, fault: stood.fault, step: stood.step, chooses: stood.chooses, instead: stood.instead, steps });
}

/** A done choice whose act's step comes before it: that step, and the sentence the verdict says (`./choice-order.ts`). */
function madeAfterAct(choice: AutomationStudioInstructedChoice, stood: AutomationStudioInstructedStanding | undefined): { afterAct?: number; afterActSaid?: string } {
  if (!stood || !("done" in stood) || !stood.afterAct) return {};
  const found = automationStudioInstructedChoiceAfterAct({ id: choice.id, of: choice.of, step: stood.done, actStep: stood.afterAct });
  return found ? { afterAct: found.actStep, afterActSaid: found.said } : {};
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

// The kept steps that do a plural act to one row, beside the step that does it
// to every row (live run `run-murz83zy-5030820f`, R10; see the header). A step
// does the same act when it is a step of the Flow (kept, and it worked) that
// changes something and runs once -- no repeat holds it -- and either says it
// does this act, or presses the same control as the repeated step: the same
// action, and the same words the domain gave for its control
// (`../../flow-draft/step-words.ts`, `does`; else `control`). A step claimed for
// another act is that act's step, never this one's, and a step with no words
// for its control is never matched by words: two unnamed presses are not the
// same press.

type Step = AutomationStudioFlowDraftStep;

/**
 * The positions of the kept steps that do act `id` to one row while `doer`, a
 * repeated step, does it to every row, and the sentence saying to drop them;
 * nothing when `doer` is not repeated or no other step does the act once.
 */
function singleRowSteps(
  id: string,
  doer: Step,
  steps: readonly Step[]
): { drop: number[]; said: string } | undefined {
  const spans = automationStudioInstructedActRepeatSpans(doer, steps);
  if (doer.disposition !== "kept" || !spans.length) return undefined;
  const control = controlOf(doer);
  const own = (claimed: string): boolean => {
    const folded = claimed.trim().toLowerCase();
    return folded === id || folded.startsWith(`${id}.`);
  };
  const once = steps.filter((each) => {
    if (each === doer || !automationStudioFlowDraftStepIsProposed(each) || each.effect !== "mutate") return false;
    if (automationStudioInstructedActRepeatSpans(each, steps).length) return false;
    if (each.acts?.some((claimed) => !own(claimed))) return false;
    if (each.acts?.some(own)) return true;
    return control !== undefined && each.actionId === doer.actionId && controlOf(each) === control;
  }).map((each) => each.position).sort((left, right) => left - right);
  if (!once.length) return undefined;
  const over = overOf(spans[0]!.carrier, steps);
  const each = over === undefined
    ? `step ${doer.position} does it repeated`
    : over.effect === "mutate"
      ? `step ${doer.position} does it on each pass while step ${over.position} succeeds`
      : `step ${doer.position} does it to each row step ${over.position} keeps`;
  const named = listed(once);
  const said = once.length === 1
    ? `step ${named} does ${id} to one row; ${each}: drop step ${named}`
    : `steps ${named} do ${id} to one row each; ${each}: drop steps ${named}`;
  return { drop: once, said };
}

/** The words of the control a step acted on, folded, or nothing when the draft has none. */
function controlOf(step: Step): string | undefined {
  const words = (step.words?.target ?? step.control)?.replace(/\s+/gu, " ").trim().toLowerCase();
  return words ? words : undefined;
}

/** The step a repeat runs over, when it names one the draft still has; none for a repeat while its last step succeeds. */
function overOf(carrier: Step, steps: readonly Step[]): Step | undefined {
  return carrier.routing?.kind === "repeat" && carrier.routing.over !== undefined ? automationStudioFlowDraftStepById(steps, carrier.routing.over) : undefined;
}

/** Positions as a sentence lists them: `6`, `2 and 9`, `2, 4 and 9`. */
function listed(positions: readonly number[]): string {
  if (positions.length < 2) return `${positions[0]}`;
  return `${positions.slice(0, -1).join(", ")} and ${positions[positions.length - 1]}`;
}
