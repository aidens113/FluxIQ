// Whether the step named for "two packs" sets two of the item, as far as the
// draft can say.
//
// **The defect this closes (live run 40, `run-muq6lqnw-fdfa7aac`, cause 2).**
// Told to add two packs of the towels, the model marked the add as repeated --
// a repeat over steps 28 and 29 -- rather than press the quantity stepper the
// page showed, and the quantity was accepted. A repeat runs its steps once for
// each item of a list; it adds this item once per list item, not twice. So a
// quantity is now set only by:
//
//   - a step that sets it: a stepper, a quantity field or a select, which the
//     draft cannot tell from any other press and so accepts, as before, unless
//     it runs under a repeat; or
//   - exactly as many kept presses of that same add on that same product as the
//     person asked for: the act's own press and each other kept step that ran
//     the same action with the same argument on the same page, none repeated.
//
// A step the Flow repeats over a list never sets a quantity (`quantity_is_a_repeat`),
// and presses of the add that are not exactly the count do not
// (`quantity_presses_differ`, with the presses counted). An act asked for every
// member of a set is held to neither: there each item's quantity is set inside
// the loop that the act's own rule wants (`./step-fault.ts`).
//
// Nothing here calls a provider or reads a page; it is the draft.

import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../../flow-draft/index.ts";
import { automationStudioInstructedChoiceSetBy } from "./choice-evidence.ts";
import type { AutomationStudioInstructedAct, AutomationStudioInstructedChoice } from "./contracts.ts";
import { automationStudioInstructedQuantity } from "./instruction-choices.ts";
import { automationStudioInstructedActRepeatSpans } from "./span.ts";

type Step = AutomationStudioFlowDraftStep;

/**
 * How a quantity stands against the step named for it: `counted` when the
 * presses of the add are exactly the count, a fault, or nothing when this rule
 * has no say and the step is judged as any setting is.
 */
export type AutomationStudioInstructedQuantityStanding =
  | { counted: number[] }
  | { fault: "quantity_is_a_repeat" }
  | { fault: "quantity_presses_differ"; presses: number[] };

/** What a refusal adds for each of these reasons (`./check.ts`), said only when one of them is refused. */
export const AUTOMATION_STUDIO_INSTRUCTED_QUANTITY_INSTRUCTIONS: ReadonlyArray<readonly ["quantity_is_a_repeat" | "quantity_presses_differ", string]> = [
  ["quantity_is_a_repeat", " A reason of quantity_is_a_repeat means the step named for a quantity runs under a repeat, which runs it once for each item of a list, not that many times on this item: "
    + "remove the mistaken repeat with amend_draft unrepeat on the step whose runs line begins that repeated span (keep preserves repeats), then set the quantity with the item's own quantity control (its stepper, quantity field or select) before adding, keep that step and name it for the choice; do not repeat the add over a list for it."],
  ["quantity_presses_differ", " A reason of quantity_presses_differ means the step named for a quantity is a press of the act's own add, and the kept presses of that add on that item (presses) are not exactly the number asked for: "
    + "keep exactly that many presses, or set the quantity control to the number and name that step for the choice."]
];

/** `actStep`: the step its act is done by, when one is. */
export function automationStudioInstructedQuantityStanding(
  choice: AutomationStudioInstructedChoice,
  act: AutomationStudioInstructedAct | undefined,
  step: Step,
  actStep: Step | undefined,
  steps: readonly Step[]
): AutomationStudioInstructedQuantityStanding | undefined {
  if (choice.choice !== "quantity" || act?.plural) return undefined;
  if (automationStudioInstructedActRepeatSpans(step, steps).length) return { fault: "quantity_is_a_repeat" };
  // A step given the number sets it; the act's own press with no number is `choice_is_the_act_step`'s.
  if (!actStep || automationStudioInstructedChoiceSetBy(step, choice)) return undefined;
  if (step !== actStep && !samePress(step, actStep)) return undefined;
  const wanted = automationStudioInstructedQuantity(choice.value);
  const presses = steps
    .filter((each) => (each === actStep || samePress(each, actStep)) && automationStudioFlowDraftStepIsProposed(each) && each.routing?.kind !== "optional" && !automationStudioInstructedActRepeatSpans(each, steps).length)
    .map((each) => each.position)
    .sort((left, right) => left - right);
  if (presses.length === wanted) return { counted: presses };
  return step === actStep ? undefined : { fault: "quantity_presses_differ", presses };
}

/**
 * The same action, run with the same argument, on the same page where both say
 * which page. An argument that names nothing (no string in it) names no
 * control, so two such steps are not known to be the same press.
 */
function samePress(left: Step, right: Step): boolean {
  if (left === right || left.actionId !== right.actionId) return false;
  const argument = left.ranWith ?? left.input;
  if (!namesSomething(argument, 0) || stable(argument) !== stable(right.ranWith ?? right.input)) return false;
  const [from, to] = [left.replay?.from, right.replay?.from];
  return from === undefined || to === undefined || stable(from) === stable(to);
}

function namesSomething(value: unknown, depth: number): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (depth > 6 || typeof value !== "object" || value === null) return false;
  return (Array.isArray(value) ? value : Object.values(value)).some((item) => namesSomething(item, depth + 1));
}

/** JSON with every object's keys in order, so two arguments written in another order compare equal. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
