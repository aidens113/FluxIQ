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
// **One rule, not two.** An act is done here exactly when the check would
// accept the step the model said does it (`./check.ts`,
// `automationStudioInstructedActStepFault`), so the checklist never shows done
// what a completion then refuses. A step says which act it does when the model
// adds it (`act`), which is also the claim the check reads.
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
// Nothing here calls a provider or reads a page; it is the instruction's words
// and the draft.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftStepGoesToLocation } from "../reachability/index.ts";
import { automationStudioInstructedActStepFault } from "./check.ts";
import { automationStudioInstructedChoiceSetBy } from "./choice-evidence.ts";
import type { AutomationStudioInstructedAct, AutomationStudioInstructedChoice } from "./contracts.ts";
import { automationStudioInstructedActs } from "./instruction-acts.ts";

/** Why an act on the checklist is not done yet. */
export type AutomationStudioInstructedActTodo =
  /** No step in the Flow says it does this act. */
  | "no_step_added"
  | "step_not_kept"
  | "step_changed_nothing"
  | "step_only_arrives"
  | "step_is_optional"
  | "act_needs_repeat"
  /** A choice: the step said to make it is the act's own press, and nothing it was given sets the choice. */
  | "choice_is_the_act_step"
  /** A choice: the step said to make it already does another act, and nothing it was given sets the choice. */
  | "step_claimed_twice";

/** One choice of an act's item as the model is shown it: how many, or which size, colour or version. */
export type AutomationStudioInstructedChoiceChecklistItem = {
  /** The act's id and what it fixes: `a2.quantity`, `a2.size`. What a step names to say it makes it. */
  id: string;
  choice: AutomationStudioInstructedChoice["choice"];
  /** The person's own words for the value: `two`, `12 Double Rolls`. */
  value: string;
  quote: string;
  done?: number;
  todo?: AutomationStudioInstructedActTodo;
  step?: number;
};

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
  todo?: AutomationStudioInstructedActTodo;
  /** The step that says it does it but does not, when one does. */
  step?: number;
  /** The choices the person made for this act's item, each done or todo. Absent when they made none. */
  choices?: AutomationStudioInstructedChoiceChecklistItem[];
};

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
  const used = new Set<AutomationStudioFlowDraftStep>();
  // The step each act is done by, so a choice given the same one is told it is its act's press.
  const actSteps = new Map<string, AutomationStudioFlowDraftStep>();
  // Every act first, then their choices: the order the check reaches its verdict in.
  const items = acts.map((act): AutomationStudioInstructedActChecklistItem => {
    const item: AutomationStudioInstructedActChecklistItem = { id: act.id, verb: act.verb, quote: act.quote, ...(act.plural ? { plural: true as const } : {}) };
    const saying = sayingSteps(input.draftSteps, act.id);
    for (const step of saying) {
      const fault = automationStudioInstructedActStepFault(act, step, input.draftSteps, onlyArrives);
      if (!fault && !used.has(step)) {
        used.add(step);
        actSteps.set(act.id, step);
        return { ...item, done: step.position };
      }
    }
    const first = saying[0];
    const fault = first ? automationStudioInstructedActStepFault(act, first, input.draftSteps, onlyArrives) : undefined;
    return fault && first ? { ...item, todo: fault, step: first.position } : { ...item, todo: "no_step_added" };
  });
  return items.map((item, index) => {
    const requires = acts[index]!.requires;
    if (!requires?.length) return item;
    return { ...item, choices: requires.map((choice) => choiceItem(choice, input.draftSteps, { used, actStep: actSteps.get(choice.of), onlyArrives })) };
  });
}

/** Every step that says it does this act or makes this choice, in the Flow first. */
function sayingSteps(steps: readonly AutomationStudioFlowDraftStep[], id: string): AutomationStudioFlowDraftStep[] {
  return steps
    .filter((step) => step.acts?.includes(id))
    .sort((left, right) => Number(right.disposition === "kept") - Number(left.disposition === "kept"));
}

/**
 * One choice, by the check's rule (`./check.ts`): a kept step that says it
 * makes it and changed something, and -- when that step already does an act --
 * one whose own input sets the value.
 */
function choiceItem(
  choice: AutomationStudioInstructedChoice,
  steps: readonly AutomationStudioFlowDraftStep[],
  held: { used: Set<AutomationStudioFlowDraftStep>; actStep: AutomationStudioFlowDraftStep | undefined; onlyArrives: (step: AutomationStudioFlowDraftStep) => boolean }
): AutomationStudioInstructedChoiceChecklistItem {
  const item: AutomationStudioInstructedChoiceChecklistItem = { id: choice.id, choice: choice.choice, value: choice.value, quote: choice.quote };
  // A choice is a setting, held to what any act of setting is and never repeated.
  const asAct: AutomationStudioInstructedAct = { id: choice.id, kind: "set", verb: choice.choice, quote: choice.quote };
  let named: { step: AutomationStudioFlowDraftStep; todo: AutomationStudioInstructedActTodo } | undefined;
  for (const step of sayingSteps(steps, choice.id)) {
    const fault = automationStudioInstructedActStepFault(asAct, step, steps, held.onlyArrives);
    const shared = !fault && held.used.has(step) && !automationStudioInstructedChoiceSetBy(step, choice);
    if (!fault && !shared) {
      held.used.add(step);
      return { ...item, done: step.position };
    }
    named ??= { step, todo: fault ?? (held.actStep === step ? "choice_is_the_act_step" : "step_claimed_twice") };
  }
  return named ? { ...item, todo: named.todo, step: named.step.position } : { ...item, todo: "no_step_added" };
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
  return items?.map(({ choices, ...item }) => ({ ...item, ...(choices ? { choices: choices.map((choice) => ({ ...choice })) } : {}) }));
}
