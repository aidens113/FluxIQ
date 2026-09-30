// Whether a step's own input evidently makes a choice of an item.
//
// `./check.ts` asks it only of a step already claimed for something else --
// in practice the press that adds -- because one press may do both only when
// it is given the choice: an add whose argument carries the quantity, or a
// step that typed the number or picked the option by its value. A plain press
// of an add control is given neither, and chooses nothing.
//
// **The test is domain-neutral.** A step's input is opaque to Core
// (`../../flow-draft/step.ts`), and this does not learn its shape: no key, no
// node id, no control is named. It reads only the step's string values --
// what it ran with and what it was written with -- for the person's own value:
//
//   - a quantity is set where some value is exactly its number, in digits or
//     as written ("2", or "two" for "two packs");
//   - a variant is chosen where some value holds its words as a run, case and
//     punctuation aside ("12 Double Rolls" in "12-double-rolls").
//
// Numbers that are not strings are not read: a list position or an index is
// a number, and would take a press of the second control for a quantity of two.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioInstructedChoice } from "./contracts.ts";
import { automationStudioInstructedQuantity } from "./instruction-choices.ts";

const MAX_DEPTH = 6;
const MAX_VALUES = 200;

/** Whether the step's own input sets the choice. Nothing here calls a provider. */
export function automationStudioInstructedChoiceSetBy(step: AutomationStudioFlowDraftStep, choice: AutomationStudioInstructedChoice): boolean {
  const values: string[] = [];
  collect(step.ranWith, 0, values);
  collect(step.input, 0, values);
  const folded = values.map(fold).filter(Boolean);
  if (choice.choice === "quantity") {
    const amount = automationStudioInstructedQuantity(choice.value);
    const wanted = new Set([fold(choice.value), ...(amount === undefined ? [] : [`${amount}`])]);
    return folded.some((value) => wanted.has(value));
  }
  const wanted = fold(choice.value);
  return wanted.length > 0 && folded.some((value) => ` ${value} `.includes(` ${wanted} `));
}

function collect(value: unknown, depth: number, into: string[]): void {
  if (into.length >= MAX_VALUES || depth > MAX_DEPTH) return;
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value) collect(item, depth + 1, into);
  else if (typeof value === "object" && value !== null) for (const item of Object.values(value)) collect(item, depth + 1, into);
}

/** Lowercased, with every run of punctuation or space as one space. */
function fold(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
