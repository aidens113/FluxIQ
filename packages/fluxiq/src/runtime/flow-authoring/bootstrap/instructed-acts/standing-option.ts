// A choice the page already had made when its act's step ran (t1023).
//
// **The defect this closes.** Paid run `run-mwuxd2v9-33928ea3` (bigbox) was
// asked to add an item to the cart "for pickup" (`a1.fulfilment`). The site's
// chooser showed Pickup chosen before any act, the add landed, and the cart
// said the item was for pickup. A choice counted done only when a step said it
// made it (`./standing.ts`), so the checklist owed `a1.fulfilment` for the rest
// of the build, and every no-progress note and amendment refusal steered the
// model for 190 steps toward an option nothing could choose again. Any task
// whose asked option is the site's default meets the same.
//
// **The rule.** The step that does an act, run on a page where one of its
// item's options stands chosen, does that option too. Whether it stands is a
// typed fact the host states on the step's own call (`chosen`,
// `../../draft/step.ts`): the page's own checked, selected, pressed, current
// or drawn-apart state, on the page as the step found it or on an earlier look
// at that page not since shown otherwise. Never words: not the act step's own
// words, not a line the page shows ("for pickup at ..."), not the model's
// reply. The words of a control that stands chosen are read only to tell which
// option it is, folded as a choice's value is (`./choice-evidence.ts`).
//
// Only a variant: which size, colour, version, fulfilment or time. A quantity
// is set by the act's own presses or a value typed (`./quantity-fault.ts`), and
// a count that happens to stand chosen says nothing of how many were added.
// Only when no step named for the choice does it: a step the model named that
// makes it stays the one that does it.
//
// **What the Flow does on a page that arrives otherwise.** No step of such a
// Flow chooses the option, so a run whose page arrives with another option
// chosen does the act without it, and nothing refuses. The checklist says so
// beside the choice (`stoodChosenSaid`) as information, never a todo: a step
// that sets the option chosen, which changes nothing where it already is, is
// what makes the Flow right however the page arrives, and naming the choice on
// it makes that step the one that does it.
//
// Nothing here calls a provider or reads a page; it is the draft and the host's statements.
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepChosen } from "../../draft/index.ts";
import type { AutomationStudioInstructedChoice } from "./contracts.ts";

/** The option standing chosen when `step` ran that is the choice the person asked for, or nothing. */
export function automationStudioInstructedChoiceStoodChosen(step: AutomationStudioFlowDraftStep, choice: AutomationStudioInstructedChoice): AutomationStudioFlowDraftStepChosen | undefined {
  if (choice.choice !== "variant" || step.effect !== "mutate") return undefined;
  const wanted = fold(choice.value);
  if (!wanted) return undefined;
  return step.chosen?.find((option) => ` ${fold(option.words)} `.includes(` ${wanted} `));
}

/** What the checklist says beside a choice its act's step did because the page had it chosen already (header). */
export function automationStudioInstructedChoiceStoodChosenSaid(input: { id: string; of: string; step: number; words: string }): string {
  const { id, of, step, words } = input;
  return `${id} stood chosen on the page when step ${step} did ${of}: the page showed "${words}" chosen, so step ${step} does ${id} too. `
    + `No step of the Flow chooses it, so a run whose page arrives with another option chosen would do ${of} without it. `
    + `To make the Flow choose it however the page arrives, run a step that sets "${words}" chosen, which changes nothing where it already is, and name ${id} on it.`;
}

/** Lowercased, with every run of punctuation or space as one space, as `./choice-evidence.ts` folds. */
function fold(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
