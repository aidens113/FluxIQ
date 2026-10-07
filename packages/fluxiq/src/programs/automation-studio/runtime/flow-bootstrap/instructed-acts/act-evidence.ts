// What a step claimed for a lasting act did instead, read from its own record
// rather than from the model's label.
//
// **The defect this closes (W1, 23 live runs).** The model named a lasting act
// on a step that did not do it, and Core counted the act done: the checklist,
// every "still not done" list, the stall note and the build's ending then hid
// the act, which no step did. Run `run-mux74k5q-1c3c2127` put a1, "put the hub
// in my cart", on the press of "Spain", one of a1's own options (a1.origin);
// `run-musp4h2f-72e8ed99` put a3 on a typed search that led to the results
// page and on a product link; `run-muqiho5c-e830ce01` put the add on "Not now",
// a popup's dismissal, and on the Spain choice. `./claim-doubt.ts` only advised.
//
// **What is read.** Only what the step already carries, and only where the
// control's words (`words.target`, else `control`) do not name the act -- its
// verb or a word of its kind (`./kind-words.ts`). A control with no words, or
// with words that name the act, is judged as before. Then, in order:
//
//   1. the host says the step answered a layer in front of the page
//      (`interruption`): it only cleared the way (`step_only_clears_the_way`);
//   2. the next recorded step found the page somewhere else (`replay.from`,
//      compared whole, `automationStudioFlowDraftStepMovedTarget`): it went to
//      another page (`step_only_arrives`);
//   3. its words carry the value of one of the act's own choices -- a variant's
//      words as a run, case and punctuation aside, or a quantity's number typed
//      (`./choice-evidence.ts` folds the same way): it made that choice
//      (`step_only_chooses`, `chooses` naming it).
//
// Only acts of adding, saving, claiming, submitting and moving: a set or open
// act's control often names only the value or the place, which is the act. A
// toggle alone is never read: a heart or a clip toggle can be the save or the
// claim itself.
//
// **The step that does name it.** Where the draft has a step whose words name
// the act, which no other act claims and whose record names no other act's
// object (`./object-binding.ts`), it is said, so the model moves the claim
// there (`automationStudioInstructedActStepThatNamesIt`).
//
// Nothing here calls a provider or reads a page; it is the draft and the words.
import { automationStudioFlowDraftStepIsProposable, automationStudioFlowDraftStepMovedTarget, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioInstructedAct, AutomationStudioInstructedActKind, AutomationStudioInstructedActMissingReason } from "./contracts.ts";
import { automationStudioInstructedQuantity } from "./instruction-choices.ts";
import { AUTOMATION_STUDIO_INSTRUCTED_ACT_KIND_WORDS, automationStudioInstructedActNamesWord } from "./kind-words.ts";
import { automationStudioInstructedActStepActsOn } from "./object-binding.ts";

type Step = AutomationStudioFlowDraftStep;

/** What a step whose words do not name its act did instead, as its record shows. */
export type AutomationStudioInstructedActStepInstead =
  | { fault: "step_only_clears_the_way" }
  | { fault: "step_only_arrives" }
  /** `chooses`: the id of the act's own choice the step made. */
  | { fault: "step_only_chooses"; chooses: string };

/** The reasons whose sentence says what the step did and where the act is named (`automationStudioInstructedActEvidenceSaid`). */
export type AutomationStudioInstructedActEvidenceFault = Extract<
  AutomationStudioInstructedActMissingReason,
  "step_only_chooses" | "step_only_clears_the_way" | "step_only_arrives" | "step_only_opens_its_choices"
>;

const EVIDENCE_FAULTS: ReadonlySet<string> = new Set<AutomationStudioInstructedActEvidenceFault>([
  "step_only_chooses",
  "step_only_clears_the_way",
  "step_only_arrives",
  "step_only_opens_its_choices"
]);

/** The acts whose control must name them: a set or open act's control often names only its value or place. */
const LASTING: ReadonlySet<AutomationStudioInstructedActKind> = new Set<AutomationStudioInstructedActKind>(["add_to", "save", "claim", "submit", "move"]);

/** Whether a reason is one `automationStudioInstructedActEvidenceSaid` words. */
export function automationStudioInstructedActIsEvidenceFault(reason: string): reason is AutomationStudioInstructedActEvidenceFault {
  return EVIDENCE_FAULTS.has(reason);
}

/**
 * What the step did instead of the act, as its own record shows, or nothing
 * when the act is not one of adding, saving, claiming, submitting or moving,
 * the step's control has no words, its words name the act, or its record shows
 * nothing else (see the header).
 */
export function automationStudioInstructedActStepDidInstead(act: AutomationStudioInstructedAct, step: Step, steps: readonly Step[]): AutomationStudioInstructedActStepInstead | undefined {
  if (!LASTING.has(act.kind)) return undefined;
  const words = wordsOf(step);
  if (!words || namesAct(act, words)) return undefined;
  if (step.interruption === true) return { fault: "step_only_clears_the_way" };
  if (automationStudioFlowDraftStepMovedTarget(step, nextRecorded(step, steps))) return { fault: "step_only_arrives" };
  const folded = fold(words);
  const typed = fold(step.words?.text ?? "");
  const chosen = (act.requires ?? []).find((choice) => {
    if (choice.choice === "variant") {
      const value = fold(choice.value);
      return value !== "" && ` ${folded} `.includes(` ${value} `);
    }
    const amount = automationStudioInstructedQuantity(choice.value);
    return typed !== "" && (typed === fold(choice.value) || (amount !== undefined && typed === `${amount}`));
  });
  return chosen ? { fault: "step_only_chooses", chooses: chosen.id } : undefined;
}

/**
 * The position of the step whose words name the act and which could do it in
 * place of `judged`: kept or taken, an action that changed something, named for
 * no other act or another act's choice, not acting on another act's object,
 * and not caught by `automationStudioInstructedActStepDidInstead`. The first
 * after `judged`, else the first before; nothing when the draft has none.
 */
export function automationStudioInstructedActStepThatNamesIt(
  act: AutomationStudioInstructedAct,
  acts: readonly AutomationStudioInstructedAct[],
  judged: Step,
  steps: readonly Step[]
): number | undefined {
  const others = acts.filter((other) => other.id !== act.id).map((other) => other.id);
  const namesOther = (step: Step): boolean => (step.acts ?? []).some((named) => {
    const folded = named.trim().toLowerCase();
    return others.some((id) => folded === id || folded.startsWith(`${id}.`));
  });
  const candidates = steps
    .filter((step) => step !== judged && step.position !== judged.position
      && (step.disposition === "kept" || step.disposition === "taken")
      && step.effect === "mutate" && automationStudioFlowDraftStepIsProposable(step))
    .filter((step) => {
      const words = wordsOf(step);
      return words !== undefined && namesAct(act, words) && !namesOther(step)
        && !automationStudioInstructedActStepActsOn(act, acts, step, steps)
        && !automationStudioInstructedActStepDidInstead(act, step, steps);
    })
    .sort((left, right) => left.position - right.position);
  return (candidates.find((step) => step.position > judged.position) ?? candidates.find((step) => step.position < judged.position))?.position;
}

/**
 * One sentence saying what the step judged for an act did and that it does
 * not do the act, then where to name the act: on step `instead` when the
 * draft has one whose words name it, else by running that press. Said the
 * same way by the checklist (`todoSaid`) and the verdict (`said`).
 */
export function automationStudioInstructedActEvidenceSaid(input: {
  act: AutomationStudioInstructedAct;
  fault: AutomationStudioInstructedActEvidenceFault;
  step: Step;
  chooses?: string | undefined;
  instead?: number | undefined;
  steps: readonly Step[];
}): string {
  const { act, step } = input;
  const words = wordsOf(step);
  const named = words ? ` (${JSON.stringify(words)})` : "";
  const did = input.fault === "step_only_chooses"
    ? choseSaid(act, step, words, input.chooses)
    : input.fault === "step_only_clears_the_way"
      ? `Step ${step.position}${named} only closed something in front of the page`
      : input.fault === "step_only_arrives"
        ? `Step ${step.position}${named} went to another page`
        : `Step ${step.position}${named} only opened the page where ${act.id}'s choices are made`;
  const there = input.instead === undefined ? undefined : input.steps.find((each) => each.position === input.instead);
  const thereWords = there ? wordsOf(there) : undefined;
  const next = input.instead !== undefined
    ? `Step ${input.instead}${thereWords ? ` (${JSON.stringify(thereWords)})` : ""} names it: name ${act.id} there with amend_draft add on step ${input.instead} with act ${act.id}.`
    : `No step in the draft names it yet: on the page where ${act.id} is done, ${act.requires?.length ? "after its choices, " : ""}run the press whose words name it with add true and act ${act.id}.`;
  return `${did}, and does not do ${act.id}. ${next}`;
}

function choseSaid(act: AutomationStudioInstructedAct, step: Step, words: string | undefined, chooses: string | undefined): string {
  const choice = act.requires?.find((each) => each.id === chooses);
  const typed = step.words?.text?.trim();
  const what = choice?.choice === "quantity" && typed
    ? `set ${JSON.stringify(words ?? "")} to ${JSON.stringify(typed)}`
    : `chose ${JSON.stringify(words ?? "")}`;
  return `Step ${step.position} ${what}, one of ${act.id}'s options${chooses ? ` (${chooses})` : ""}`;
}

/** The words of the control a step acted on, or nothing when the draft has none. */
function wordsOf(step: Step): string | undefined {
  return step.words?.target?.trim() || step.control?.trim() || undefined;
}

/**
 * Whether words name the act: its verb, or a word of its kind, whole. Words
 * that name a visit -- "View cart", "Go to basket", "Open saved items" -- name
 * the place the act fills, not the act, unless they name its own verb: a press
 * of "View cart" adds nothing, and is never offered as the step that adds.
 */
function namesAct(act: AutomationStudioInstructedAct, words: string): boolean {
  const names = (word: string): boolean => automationStudioInstructedActNamesWord(words, word);
  if (names(act.verb)) return true;
  if (AUTOMATION_STUDIO_INSTRUCTED_ACT_KIND_WORDS.open.some(names)) return false;
  return AUTOMATION_STUDIO_INSTRUCTED_ACT_KIND_WORDS[act.kind].some(names);
}

/** The first step after this one, by position, whose place was recorded: where the page was left. */
function nextRecorded(step: Step, steps: readonly Step[]): Step | undefined {
  return steps
    .filter((candidate) => candidate.position > step.position && candidate.replay?.from !== undefined)
    .reduce<Step | undefined>((first, candidate) => (first === undefined || candidate.position < first.position ? candidate : first), undefined);
}

/** Lowercased, with every run of punctuation or space as one space (as `./choice-evidence.ts`). */
function fold(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
