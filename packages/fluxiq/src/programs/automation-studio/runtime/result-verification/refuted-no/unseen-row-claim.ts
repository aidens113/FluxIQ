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
// the narrowing was right is the judge's to weigh. So does every sentence
// where a read's counts do not add up, since a row two conditions both
// rejected is in no label list.

import { automationStudioRequestRowWords } from "../request-rows/index.ts";
import type { AutomationStudioResultNoClaim, AutomationStudioResultNoNamedRows, AutomationStudioResultNoSeenRead } from "./types.ts";

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
