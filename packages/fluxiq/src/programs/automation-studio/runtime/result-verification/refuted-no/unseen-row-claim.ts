// A no's claim that a condition left out a row no read ever saw (t654).
//
// **Why.** A8 frozen pair 5 project `run-mva6mlm4-97fe42f9` step 0046: over an
// exact answer, a judge said a name condition "missed" a row the condition's
// own words would have kept. The row was on the unfiltered start page only: a
// site filter pressed before the read had removed it, so it never reached the
// read and no condition ever saw it. Core held no record of the row, so the
// claim stood (`./named-rows.ts`, `unmatched`), and the trial was failed on a
// condition that had done nothing wrong.
//
// **What Core measured.** Which rows each read saw, where its own counts say
// its labels are every one (`./record.ts`, `whole`), and the steps that acted
// on the page before it (`narrowedBefore`, t482). Nothing about whether those
// steps were right.
//
// **The rule.** A sentence that says a condition left out, missed, dropped or
// excluded a row is refuted when:
//
// - every row it names is one Core holds no record of, each named by a quote
//   (an id Core cannot find is no quote, and a row it does hold goes the way it
//   always went, `./missing-claim.ts`), and no quote shares its leading words
//   with any label a read saw;
// - every read the result was judged on saw rows Core can list whole, and a
//   step acted on the page before each one.
//
// Core's finding is that no condition saw the row: it never reached the read.
// A sentence that blames a step -- names one by its node id, label or control,
// or speaks of a step, filter, facet, search, sort or option -- stands: whether
// the narrowing was right is the judge's to weigh, unless Core measured that
// every step it blames removed no row (below, t659). So does every sentence
// where a read's counts do not add up, since a row two conditions both
// rejected is in no label list.

import { automationStudioRequestRowWords } from "../request-rows/index.ts";
import { automationStudioResultConditionReferences } from "./condition-references.ts";
import { automationStudioResultNodeIdsSaid } from "./node-ids.ts";
import type {
  AutomationStudioResultNoClaim,
  AutomationStudioResultNoNamedRows,
  AutomationStudioResultNoNarrowingStep,
  AutomationStudioResultNoRecord,
  AutomationStudioResultNoSeenRead
} from "./types.ts";

/** A condition, by number or by name. */
const SPEAKS_OF_A_CONDITION = /\b(?:conditions?|criteri(?:on|a))\b/iu;
/** Words that say a condition kept a row out. */
const LEFT_OUT = /\b(?:miss(?:ed|es|ing)?|left\s+(?:\S+\s+){0,2}?out|leaves?\s+(?:\S+\s+){0,2}?out|leaving\s+(?:\S+\s+){0,2}?out|dropp(?:ed|ing)|drops?|exclud(?:ed|es|ing)|exclude|filter(?:ed|s)?\s+(?:\S+\s+){0,2}?out|reject(?:ed|s)?|remov(?:ed|es)|omit(?:s|ted)?)\b/iu;
/** Words that speak of a step that acted on the page, not of a condition. Generic, never any site's. */
const SPEAKS_OF_A_STEP = /\b(?:steps?|filters?|facets?|search(?:es|ed)?|sort(?:ed|s)?|refine(?:d|ments?)?|options?|selected|selection|chose|chosen|clicked|pressed|tabs?|categor(?:y|ies)|departments?)\b/iu;
/** The leading words a quote and a label are compared by. */
const LEADING_WORDS = 3;

/** The claim a sentence makes that a condition left out a row no read saw (header); nothing where it makes none or Core cannot say. */
export function automationStudioResultUnseenRowClaim(sentence: string, named: AutomationStudioResultNoNamedRows): AutomationStudioResultNoClaim | undefined {
  const unseen = named.unseen;
  if (!unseen || named.stored.length || named.leftOut.length || !unseen.quotes.length) return undefined;
  if (!SPEAKS_OF_A_CONDITION.test(sentence) || !LEFT_OUT.test(sentence)) return undefined;
  const reads = unseen.reads ?? [];
  if (!reads.length || !reads.every((read) => read.whole && read.narrowedBefore.length > 0)) return undefined;
  if (blamesAStep(sentence, reads)) return undefined;
  const seen = (unseen.seenLabels ?? []).map(wordsOf);
  if (!unseen.quotes.every((quote) => !sharesLeadingWords(wordsOf(quote.split("…")[0] ?? quote), seen))) return undefined;
  const steps = [...new Set(reads.flatMap((read) => read.narrowedBefore.map(stepName)))];
  const finding = unseen.quotes.map((quote) =>
    `No condition saw "${quote}": it is in none of the rows the read saw, so it never reached the read.`).join(" ");
  return { refuted: true, finding: `${finding} ${steps.join(", ")} acted on the page before the read; whether that was right is the judge's to weigh.` };
}

/** Whether a sentence blames a step that acted before a read (header). */
function blamesAStep(sentence: string, reads: readonly AutomationStudioResultNoSeenRead[]): boolean {
  if (SPEAKS_OF_A_STEP.test(sentence)) return true;
  const said = sentence.toLowerCase();
  return reads.some((read) => read.narrowedBefore.some((step) =>
    [step.nodeId, step.label, step.control].some((words) => words !== undefined && words.trim().length > 0 && said.includes(words.toLowerCase()))));
}

/** A step as the finding names it: its label, else its control's words, else its node id. */
function stepName(step: AutomationStudioResultNoSeenRead["narrowedBefore"][number]): string {
  return step.label ? `"${step.label}"` : step.control ? `the step choosing "${step.control}"` : `step ${step.nodeId}`;
}

/** Whether a quote's leading words run anywhere in a seen label, or a seen label's leading words run in the quote. */
function sharesLeadingWords(quote: readonly string[], seen: ReadonlyArray<readonly string[]>): boolean {
  if (!quote.length) return true;
  const lead = quote.slice(0, LEADING_WORDS);
  return seen.some((label) => runsIn(lead, label) || (label.length > 0 && runsIn(label.slice(0, LEADING_WORDS), quote)));
}

function runsIn(words: readonly string[], within: readonly string[]): boolean {
  for (let start = 0; start + words.length <= within.length; start += 1) if (words.every((word, index) => within[start + index] === word)) return true;
  return false;
}

function wordsOf(text: string): string[] {
  return automationStudioRequestRowWords(text).map((word) => word.word);
}

// The steps that acted on the page before a read that one sentence of a no
// names (t659), found in Core's record (`./record.ts`, `narrowing`).
//
// A judge names such a step by its full node id, as it is told to; by the
// node id's last part where that is a short id of letters then digits ("s10")
// that no other step of the Flow ends with; by the step's label; by the words
// of the control it pressed or chose, with or without the count the page
// printed beside it ("4 & up (32)"); or by the option it chose. Words are
// compared folded, as words of their own (never inside a longer word), and
// only at three characters or more. A group's name alone names no step: a
// judge says "rating" of a condition as readily as of a facet.
//
// Beside the steps, the node ids the sentence names that are neither such a
// step nor a read they came before (`others`): a sentence naming those speaks
// of more than these steps.

/** A count in parentheses ending a control's words, as the page prints it beside an option. */
const TRAILING_COUNT = /\s*\(\d{1,3}(?:,\d{3})+\)$|\s*\(\d+\)$/u;
/** A node id's last part that reads as a short id: letters, then digits. */
const SHORT_ID = /^\p{L}+\d+$/u;
/** The fewest characters words must have to name a step. */
const LEAST_CHARACTERS = 3;

/** The narrowing steps a sentence names, and the other node ids it names (header). */
export function automationStudioResultNarrowingStepsNamed(sentence: string, record: AutomationStudioResultNoRecord): { steps: AutomationStudioResultNoNarrowingStep[]; others: string[] } {
  const narrowing = record.narrowing;
  if (!narrowing?.steps.length) return { steps: [], others: [] };
  const said = automationStudioResultNodeIdsSaid(sentence, record.nodeIds);
  const byId = new Set(narrowing.steps.map((step) => step.nodeId));
  const reads = new Set(narrowing.readNodeIds);
  const others = said.ids.filter((id) => !byId.has(id) && !reads.has(id));
  const text = ` ${fold(said.text)} `;
  const steps = narrowing.steps.filter((step) => said.ids.includes(step.nodeId) || shortIdSaid(step.nodeId, text, record.nodeIds) || wordsSaid(step, text));
  return { steps, others };
}

/** Whether the folded text names the step by its node id's short last part, which no other node id ends with (header). */
function shortIdSaid(nodeId: string, text: string, nodeIds: readonly string[]): boolean {
  const last = nodeId.split(".").pop() ?? "";
  if (last === nodeId || !SHORT_ID.test(last)) return false;
  if (nodeIds.filter((id) => id.split(".").pop() === last).length > 1) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}_.-])${escaped(last.toLowerCase())}(?![\\p{L}\\p{N}_-])`, "u").test(text);
}

/** Whether the folded text names the step by its label, its control's words, or the option it chose (header). */
function wordsSaid(step: AutomationStudioResultNoNarrowingStep, text: string): boolean {
  const control = step.control?.replace(TRAILING_COUNT, "");
  return [step.label, step.control, control, step.chose].some((words) => {
    const folded = words === undefined ? "" : fold(words);
    return folded.length >= LEAST_CHARACTERS && new RegExp(`[^\\p{L}\\p{N}]${escaped(folded)}[^\\p{L}\\p{N}]`, "u").test(text);
  });
}

function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").trim();
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

// Whether Core measured that a step which acted on the page before a read
// removed no row, and Core's words for it (t659).
//
// **What Core measured, and only that.** The page stated a number of results
// before the step and the same number after it (`resultCount`, t655), both
// stated; and the step only added a choice (`addedChoice`, `./types.ts`): its
// group had no option chosen before it, and exactly one became chosen. A
// choice added to a group narrows what the page shows to rows it showed
// before, so as many after as before are the same rows. Without the second
// test a switch of one option for another, or a sort, could state the same
// count with other rows, and Core would say what it never measured. A step
// whose count changed, or whose count was not stated, removed rows as far as
// Core can say.

/** Core's words that the step removed no row, where it measured that (header); nothing otherwise. */
export function automationStudioResultStepRemovedNoRow(step: AutomationStudioResultNoNarrowingStep): string | undefined {
  const before = step.resultCount?.before;
  const after = step.resultCount?.after;
  if (before === undefined || after === undefined || before !== after) return undefined;
  if (!step.group || !step.chose || step.addedChoice !== true) return undefined;
  const name = step.label ? `Step "${step.label}"` : `Step ${step.nodeId}`;
  return `${name} chose "${step.chose}" in "${step.group}": the page stated ${before} results before it and ${after} after, so it removed no row; no row the request asks for can be missing because of it.`;
}

// A no's claim against a step that acted on the page before a read, where Core
// measured that the step removed no row (t659).
//
// **Why.** A8 frozen pair 6 candidate towels `run-mvac1av6-f7b0f9e2`: a saved
// Flow's playback stored exactly the rows asked for, and both runtime judges
// said no. Each blamed one step before the read, a rating option, as narrower
// (or broader) than the request, and asked to remove it. Core's own record of
// that step said the page stated 16 results before it and 16 after: it removed
// no row. Nothing weighed a no against that count -- the rule above
// left every sentence that blames a step standing, and the t655 narrowing
// re-ask reads only an unsure -- so two nos Core's measurement contradicts
// refuted the run, and a re-author spent its whole allowance removing a step
// that did nothing, and broke the read.
//
// **The rule.** A sentence that names one or more such steps
// (`automationStudioResultNarrowingStepsNamed`) and says something is wrong of them is
// refuted where Core measured, of every step it names, that it removed no row
// (`automationStudioResultStepRemovedNoRow`). It is not read so where it also names a row --
// stored, left out, or one Core cannot find -- a condition, by number or as a
// bound, or a step that is neither such a step nor a read: then it speaks of
// more than Core measured here, and is weighed as before.
//
// Core's finding states the counts and that no row the request asks for can be
// missing because of the step. A no refuted whole is asked once more with it
// (`./reask.ts`), and a no still refuted is unsure: never a no, never a yes.

/** Words that say something is wrong of a step. Generic, never any site's. */
const BLAMES = /\b(?:not|no|never|none|missing|absent|wrong|incorrect(?:ly)?|should|must|instead|only|lacks?|fails?|failed|exclud\w*|remov\w*|drop\w*|omit\w*|miss(?:es|ed)?|left\s+out|leaves?\s+out|narrow\w*|broader|wider|restrict\w*|redundant|unnecessary|unrequested)\b|n['’]t\b/iu;
/** Words that speak of a condition, not a step. */
const SPEAKS_OF_A_BOUND = /\b(?:conditions?|bounds?|thresholds?|criteri(?:on|a)|cut-?off)\b/iu;

/** The claim a sentence makes against narrowing steps Core measured as removing no row (header); nothing where it makes none or speaks of more. */
export function automationStudioResultNarrowingStepClaim(sentence: string, named: AutomationStudioResultNoNamedRows, record: AutomationStudioResultNoRecord): AutomationStudioResultNoClaim | undefined {
  if (!record.narrowing?.steps.length || named.stored.length || named.leftOut.length || named.unmatched) return undefined;
  if (automationStudioResultConditionReferences(sentence).length || SPEAKS_OF_A_BOUND.test(sentence) || !BLAMES.test(sentence)) return undefined;
  const { steps, others } = automationStudioResultNarrowingStepsNamed(sentence, record);
  if (!steps.length || others.length) return undefined;
  const findings = steps.map(automationStudioResultStepRemovedNoRow);
  if (!findings.every((finding): finding is string => finding !== undefined)) return undefined;
  return { refuted: true, finding: findings.join(" ") };
}
