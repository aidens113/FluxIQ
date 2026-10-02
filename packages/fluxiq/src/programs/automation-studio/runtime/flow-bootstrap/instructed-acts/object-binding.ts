// Whether the step a claim names acted on the act's own object, as far as the
// step's own record can say.
//
// **The defect this closes (live run 40, `run-muq6lqnw-fdfa7aac`, cause 2).**
// Told to add two packs of the towels and one pack of the napkins, the build
// was accepted with the napkins act (a3) claimed on a step of the towels'
// search, and the Flow added no napkins at all. Every rule a step was held to
// -- kept, changed something, not optional, not claimed twice -- held: nothing
// held the claim to *what* the step acted on. Now a step answers an act only if
// what its record shows it acted on agrees with the act's object
// (`./act-object.ts`).
//
// **What is read, and in what order.** Only what the step already carries,
// and only its string values, as `./choice-evidence.ts` reads them: no key, no
// node id and no control is named, so no domain's shape is learnt here. Three
// sources, nearest first, and the first that names any act's object decides:
//
//   1. the step itself: what it ran with and what it was written with -- the
//      target's name or text, the row or card it sat in, the option it chose,
//      the words it typed;
//   2. the page it acted on: where the step found the page (`replay.from`);
//   3. the page it left: where the next step of the draft found the page, so a
//      press whose own record names nothing (a search's submit, "⚲") is held to
//      what it led to. Only a step decided no earlier than this one counts.
//
// **Lenient where the record is silent, strict where it names another.** A
// source that names neither this act's object nor another's says nothing, and
// a step none of whose sources names any object is accepted as before. A
// source that names this act's object, by any one of its own words, binds it.
// Only a source that names none of this act's own words and names another
// act's object by two of that object's own words refuses it, and says which
// act the step acts for instead. "Own" words are those no other act's object
// has, so the brand both products share names neither; an act whose object
// has no own word is held to nothing, and one with a single own word can
// never be named against another ("table" against "tables" was the near miss
// that set two). An act of opening has no object (`./act-object.ts`).
//
// Nothing here calls a provider or reads a page; it is the draft and the words.

import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioInstructedActObject, automationStudioInstructedObjectWords } from "./act-object.ts";
import type { AutomationStudioInstructedAct } from "./contracts.ts";

type Step = AutomationStudioFlowDraftStep;

const MAX_DEPTH = 6;
const MAX_VALUES = 400;
/** How many of another object's own words a source must name to say the step acted on it. */
const RIVAL_WORDS = 2;

/**
 * The act whose object the step's record names instead of this act's, or
 * nothing when the record names this act's object, or names no act's object.
 */
export function automationStudioInstructedActStepActsOn(
  act: AutomationStudioInstructedAct,
  acts: readonly AutomationStudioInstructedAct[],
  step: Step,
  steps: readonly Step[]
): AutomationStudioInstructedAct | undefined {
  const objects = acts.map((each) => ({ act: each, words: automationStudioInstructedActObject(each)?.words ?? [] }));
  const ownWords = (of: AutomationStudioInstructedAct): string[] => {
    const theirs = new Set(objects.filter((other) => other.act !== of).flatMap((other) => other.words));
    return (objects.find((each) => each.act === of)?.words ?? []).filter((word) => !theirs.has(word));
  };
  const own = ownWords(act);
  if (!own.length) return undefined;
  const rivals = acts.filter((other) => other !== act).map((other) => ({ act: other, words: ownWords(other) })).filter((rival) => rival.words.length);
  if (!rivals.length) return undefined;
  for (const source of sources(step, steps)) {
    const said = new Set(source.flatMap(automationStudioInstructedObjectWords));
    if (own.some((word) => said.has(word))) return undefined;
    const named = rivals
      .map((rival) => ({ act: rival.act, hits: rival.words.filter((word) => said.has(word)).length }))
      .filter((rival) => rival.hits >= RIVAL_WORDS)
      .sort((left, right) => right.hits - left.hits);
    if (named.length) return named[0]!.act;
  }
  return undefined;
}

/**
 * What a refusal says for a step whose record names another act's object
 * (`./check.ts`): which object it acted on and which act asks for it, then the
 * object of `of` -- the act itself, or the act whose item a choice qualifies --
 * each in the person's words (`./act-object.ts`), so the model can move the
 * claim. Never a word of the step's record, which may hold what the model is
 * never shown.
 */
export function automationStudioInstructedActsOnSaid(input: { id: string; of: string; step: string; actsOn: string; acts: readonly AutomationStudioInstructedAct[] }): string {
  const objectOf = (id: string): string => {
    const act = input.acts.find((each) => each.id === id);
    return act ? automationStudioInstructedActObject(act)?.name ?? act.quote : "another item";
  };
  const own = objectOf(input.of);
  return ` For ${input.id}, step ${input.step} acts on ${objectOf(input.actsOn)}, which ${input.actsOn} asks for, not on ${own}: `
    + `name step ${input.step} for ${input.actsOn} if it does that, and name ${input.id} on a step that acts on ${own}, running that step first if none does.`;
}

/** The step's record as the three sources the header names, each its string values. */
function sources(step: Step, steps: readonly Step[]): string[][] {
  const itself: string[] = [];
  collect(step.ranWith, 0, itself);
  collect(step.input, 0, itself);
  collect(step.replay?.produced, 0, itself);
  const actedOn: string[] = [];
  collect(step.replay?.from, 0, actedOn);
  const next = steps.find((each) => each.position === step.position + 1 && each.iteration >= step.iteration);
  const left: string[] = [];
  collect(next?.replay?.from, 0, left);
  return [itself, actedOn, left];
}

function collect(value: unknown, depth: number, into: string[]): void {
  if (into.length >= MAX_VALUES || depth > MAX_DEPTH) return;
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value) collect(item, depth + 1, into);
  else if (typeof value === "object" && value !== null) for (const item of Object.values(value)) collect(item, depth + 1, into);
}
