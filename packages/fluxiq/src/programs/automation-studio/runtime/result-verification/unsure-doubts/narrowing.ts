// An unsure call's doubt that a step narrowed the page to an option the
// request does not name, held to the request's own words (t655).
//
// **Why.** A8 frozen pair 5 towels (`run-mva6mlo8-f519063c`): a step chose one
// option of a named group before the read, an option the request asks for by
// its own words, and a judge answered unsure because the step chose "an option
// the request does not name". Beside a yes, that doubt left the trial
// unconfirmed, and the builder was steered off a step the request asks for.
//
// **What Core measures, and only that.** The step's record
// (`../narrowed-before.ts`, `../narrowing-group.ts`): it chose one option of a
// named group the page showed (`group`, `chose`), and the other options it
// left unchosen with the counts the page showed. A doubt speaks of such a step
// where a sentence names it -- its label, its node id, its group or the option
// it chose -- and says the request does not name, mention, specify or ask for
// it. It is contradicted where the option's words pass the request-text test
// (`../refuted-no/request-text-test.ts`): they run word for word in the request, never
// beside a word that negates, excludes or offers an alternative. Core's words
// then name the request's words and the options the step left out, and the
// call is asked once more (`../agreement.ts`); its answer takes its place, so a
// yes still needs two yeses. A doubt naming any step whose option is not the
// request's own words stands: whether that narrowing was right is the judge's.
//
// **And a no that blames such a step (t666).** A8 frozen pair 8 candidate towels
// `run-mvam0lys-2d3eb090`, 0064: a no blamed a step that chose the request's
// own words in a named group, saying it kept less than the request asks; Core
// could not refute it (it did not see the rows the step removed), the builder
// dropped the step, and nothing in the Flow read that part of the request
// again. Core still refutes nothing here: it never measured the rows such a
// step removed. A no whose sentences blame steps (`automationStudioResultNarrowingNoBlamed`)
// -- name one and say it narrows, keeps less, drops, removes, excludes,
// restricts or should go, or that the request does not name it -- where at
// least one chose an option of a named group whose words pass the request-text
// test, and each other one it blames chose such an option too or, by the
// page's own count, removed no row (it only added a choice, and the page stated
// as many results after it as before, t659), is answered with Core's words on
// each, to ask it once more (`./narrowing-no-reask.ts`). Its answer takes its
// place; a yes still needs two yeses. A no blaming any step that chose words
// not the request's, and removed rows, is the judge's, and is not asked again.

import type { AutomationStudioResultNarrowingStep, AutomationStudioResultReadAccount, AutomationStudioResultRepairDirective } from "../contracts/index.ts";
import { automationStudioResultReadingSentences, automationStudioResultRequestTextTest } from "../refuted-no/index.ts";

/** Words that say the request does not name what a step chose. Generic, never any site's. */
const NOT_NAMED = new RegExp([
  String.raw`\b(?:request|instructions?|task|query)\b[^.;]*?\b(?:does\s+not|doesn['’]t|did\s+not|didn['’]t|never)\s+(?:name|mention|specify|say|state|ask(?:\s+for)?|require|request|include)\b`,
  String.raw`\bnot\s+(?:named|mentioned|specified|stated|requested|asked\s+for|required|part\s+of|in)\b[^.;]*?\b(?:request|instructions?|task|query)\b`,
  String.raw`\b(?:unrequested|unspecified|unasked)\b`
].join("|"), "iu");

/** A reading an unsure call gave, as the verification keeps it. */
type Reading = NonNullable<AutomationStudioResultRepairDirective["judgement"]>;

/** Core's words for the record that contradicts a doubt about a narrowing step (header); nothing where the doubt makes none or the record does not settle it. */
export function automationStudioResultNarrowingDoubtContradicted(
  doubt: Reading | undefined,
  reads: readonly AutomationStudioResultReadAccount[] | undefined,
  requestText: string | undefined,
  says: ((text: string) => boolean) | undefined
): string | undefined {
  const steps = uniqueSteps(reads);
  if (!steps.length || !requestText || !says) return undefined;
  const sentences = [doubt?.expected, doubt?.observed, doubt?.advice].flatMap((text) => automationStudioResultReadingSentences(text));
  const doubted = new Map<string, AutomationStudioResultNarrowingStep>();
  for (const sentence of sentences) {
    if (!NOT_NAMED.test(sentence)) continue;
    for (const step of steps) if (names(sentence, step)) doubted.set(step.nodeId, step);
  }
  if (!doubted.size) return undefined;
  const settled = [...doubted.values()].map((step) => ({ step, texts: step.group && step.chose ? requestWords(step.chose, requestText, says) : undefined }));
  if (!settled.every(({ texts }) => texts !== undefined)) return undefined;
  return settled.map(({ step, texts }) => sentence(step, texts!)).join(" ");
}

/** Words that blame a step a sentence names: it narrowed, kept less, dropped or should go. Generic, never any site's. */
const BLAMES = new RegExp([
  String.raw`\b(?:narrow(?:s|ed|ing|er)?|restrict(?:s|ed|ing|ive)?|limit(?:s|ed|ing)?|exclud(?:e|es|ed|ing)|drop(?:s|ped|ping)?|remov(?:e|es|ed|ing)|replac(?:e|es|ed|ing)|los(?:e|es|ing|t)|beyond)\b`,
  String.raw`\bkeep(?:s|ing)?\s+(?:only|less|fewer)\b`,
  String.raw`\bfilter(?:s|ed)?\s+out\b`,
  String.raw`\btoo\s+(?:narrow|strict|restrictive)\b`
].join("|"), "iu");

/**
 * Core's words on each step a no's reading blames (header, t666), to ask it
 * once more: at least one chose an option of a named group whose words are the
 * request's own, and every other one it blames did too or removed no row by
 * the page's own count. Nothing where it blames none, or any other.
 */
export function automationStudioResultNarrowingNoBlamed(
  reading: Reading | undefined,
  reads: readonly AutomationStudioResultReadAccount[] | undefined,
  requestText: string | undefined,
  says: ((text: string) => boolean) | undefined
): string | undefined {
  const steps = uniqueSteps(reads);
  if (!steps.length || !requestText || !says) return undefined;
  // `expected` restates the request: its words blame nothing.
  const sentences = [reading?.observed, reading?.advice].flatMap((text) => automationStudioResultReadingSentences(text));
  const blamed = new Map<string, AutomationStudioResultNarrowingStep>();
  for (const sentence of sentences) {
    if (!BLAMES.test(sentence) && !NOT_NAMED.test(sentence)) continue;
    for (const step of steps) if (names(sentence, step)) blamed.set(step.nodeId, step);
  }
  const weighed = [...blamed.values()].map((step) => ({ step, texts: step.group && step.chose ? requestWords(step.chose, requestText, says) : undefined }));
  if (!weighed.some(({ texts }) => texts !== undefined) || !weighed.every(({ step, texts }) => texts !== undefined || removedNone(step))) return undefined;
  return weighed.map(({ step, texts }) => (texts ? sentence(step, texts) : noneRemoved(step))).join(" ");
}

/** Whether, by the page's own count, the step removed no row: it only added a choice, and the page stated as many results after it as before (t659). */
function removedNone(step: AutomationStudioResultNarrowingStep): boolean {
  return step.addedChoice === true && step.resultCount?.before !== undefined && step.resultCount.before === step.resultCount.after;
}

/** Core's words for a step that removed no row by the page's own count. */
function noneRemoved(step: AutomationStudioResultNarrowingStep): string {
  const name = step.label ? `"${step.label}"` : `Step ${step.nodeId}`;
  const chose = step.group && step.chose ? ` chose "${step.chose}" in "${step.group}", and` : "";
  return `${name}${chose} only added that choice: the page stated ${step.resultCount!.before} results before it and ${step.resultCount!.after} after, so it removed no row.`;
}

/** Every narrowing step of every read, once each, by node id. */
function uniqueSteps(reads: readonly AutomationStudioResultReadAccount[] | undefined): AutomationStudioResultNarrowingStep[] {
  const steps = new Map<string, AutomationStudioResultNarrowingStep>();
  for (const read of reads ?? []) for (const step of read.narrowedBefore ?? []) if (!steps.has(step.nodeId)) steps.set(step.nodeId, step);
  return [...steps.values()];
}

/** Whether a sentence names the step: its label, node id, group or the option it chose, as words of their own. */
function names(sentence: string, step: AutomationStudioResultNarrowingStep): boolean {
  const said = ` ${fold(sentence)} `;
  return [step.label, step.nodeId, step.group, step.chose].some((words) => {
    const folded = words === undefined ? "" : fold(words);
    return folded.length > 1 && new RegExp(`[^\\p{L}\\p{N}]${escaped(folded)}[^\\p{L}\\p{N}]`, "u").test(said);
  });
}

/** The option's words, where they are the request's own (`../refuted-no/request-text-test.ts`); nothing otherwise. */
function requestWords(chose: string, requestText: string, says: (text: string) => boolean): string[] | undefined {
  // The test reads a condition's wording; the option is tested as a positive text test of its words.
  return automationStudioResultRequestTextTest(`option contains ${JSON.stringify(chose)}`, requestText, says);
}

/** Core's words for one step: what it chose, that the request says those words, and what it left out. */
function sentence(step: AutomationStudioResultNarrowingStep, texts: readonly string[]): string {
  const name = step.label ? `"${step.label}"` : `Step ${step.nodeId}`;
  const left = (step.leftOptions ?? []).map((option) => `"${option.words}"${option.count !== undefined ? ` (${option.count})` : ""}`);
  const counts = step.resultCount?.before !== undefined && step.resultCount.after !== undefined
    ? ` The page stated ${step.resultCount.before} results before it and ${step.resultCount.after} after.` : "";
  return `${name} chose "${step.chose}" in "${step.group}", and the request itself says ${texts.map((text) => `"${text}"`).join(" and ")}.`
    + (left.length ? ` The options it left unchosen: ${left.join(", ")}.` : " It left no other option of that group.")
    + counts;
}

function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").trim();
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
