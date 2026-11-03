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
// call is asked once more (`../agreement/`); its answer takes its place, so a
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
//
// **Only where such steps are every reason the no gives (t686).** A8 cost round
// `run-mvblov2i-abb7d82e`, judge 0044: a no's sentence called a step "redundant
// but not harmful", another named a row whose label holds an option's word,
// and a third said rows the request leaves out were stored; the first two were
// read as blaming steps, the third was never weighed, and the re-ask's yes took
// a correct no's place. Now the no's reasons are cut by the shared rule
// (`../agreement/no-reasons.ts`): a part calling a step harmless, redundant,
// matching or correct is no reason and blames nothing; a step is named only
// after the names of rows Core's reads stored or left out, and every quoted
// text that is no step's own words, are taken out of the part; a short node id
// (its last segment) names its step too; and the no is answered only where
// every reason it gives is such a blame or refuted by Core's record -- the
// "only" this header promised. And Core's words state what it measured: a step
// that is a split facet (`./split-facets.ts`) is never said to choose the
// request's words; its words say what it chose, the page's counts, and that a
// site filter's option words do not show each kept row meets the request's
// clause, a row's own text does. A doubt naming a split facet is not
// contradicted: Core's record does not settle whether the request names it.

import type { AutomationStudioResultNarrowingStep, AutomationStudioResultReadAccount, AutomationStudioResultRepairDirective } from "../contracts/index.ts";
// Not the barrel: `../agreement/index.ts` leads back here through its re-asks.
import { automationStudioResultNoReasonsSettled } from "../agreement/no-reasons.ts";
import { automationStudioResultReadingSentences, automationStudioResultRequestTextTest, type AutomationStudioResultNoRecord } from "../refuted-no/index.ts";
import { automationStudioResultSplitFacets, type AutomationStudioResultSplitFacet } from "./split-facets.ts";

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
  const facets = splitFacets(steps, requestText, says);
  const settled = [...doubted.values()].map((step) => ({ step, texts: step.group && step.chose && !facets.has(step.nodeId) ? requestWords(step.chose, requestText, says) : undefined }));
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
 * request's own, every other one it blames did too or removed no row by the
 * page's own count, and every other reason it gives Core's record refutes
 * (t686, `../agreement/no-reasons.ts`). Nothing where it blames none, any
 * other, or gives a reason that stands. `record`, where given, names the rows
 * the result stored too, and refutes reasons.
 */
export function automationStudioResultNarrowingNoBlamed(
  reading: Reading | undefined,
  reads: readonly AutomationStudioResultReadAccount[] | undefined,
  requestText: string | undefined,
  says: ((text: string) => boolean) | undefined,
  record?: AutomationStudioResultNoRecord | undefined
): string | undefined {
  const steps = uniqueSteps(reads);
  if (!steps.length || !requestText || !says) return undefined;
  const facets = splitFacets(steps, requestText, says);
  const rows = rowLabels(reads, record);
  const words = new Map(steps.map((step) => [step.nodeId, step.group && step.chose ? requestWords(step.chose, requestText, says) : undefined] as const));
  // A part blames the steps it names, once rows and other quotes are out, where each chose the request's words or removed no row.
  const blamedBy = (part: string): AutomationStudioResultNarrowingStep[] | undefined => {
    const { text, namedRow } = withoutRows(part, rows, steps);
    const named = steps.filter((step) => names(text, step));
    if (!named.length || !named.every((step) => words.get(step.nodeId) !== undefined || removedNone(step))) return undefined;
    return BLAMES.test(text) || NOT_NAMED.test(text) || !namedRow ? named : undefined;
  };
  const { settled, addressed } = automationStudioResultNoReasonsSettled(reading, { addressed: (part) => blamedBy(part) !== undefined, record });
  if (!settled) return undefined;
  const blamed = new Map<string, AutomationStudioResultNarrowingStep>();
  for (const part of addressed) for (const step of blamedBy(part) ?? []) blamed.set(step.nodeId, step);
  const weighed = [...blamed.values()].map((step) => ({ step, texts: words.get(step.nodeId) }));
  if (!weighed.some(({ texts }) => texts !== undefined)) return undefined;
  return weighed.map(({ step, texts }) => (texts ? sentence(step, texts, facets.get(step.nodeId)) : noneRemoved(step))).join(" ");
}

/** Whether, by the page's own count, the step removed no row: it only added a choice, and the page stated as many results after it as before (t659). */
function removedNone(step: AutomationStudioResultNarrowingStep): boolean {
  return step.addedChoice === true && step.resultCount?.before !== undefined && step.resultCount.before === step.resultCount.after;
}

/** Core's words for a step that removed no row by the page's own count. */
function noneRemoved(step: AutomationStudioResultNarrowingStep): string {
  const chose = step.group && step.chose ? ` chose "${step.chose}" in "${step.group}", and` : "";
  return `${stepName(step)}${chose} only added that choice: the page stated ${step.resultCount!.before} results before it and ${step.resultCount!.after} after, so it removed no row.`;
}

/** Every narrowing step of every read, once each, by node id. */
function uniqueSteps(reads: readonly AutomationStudioResultReadAccount[] | undefined): AutomationStudioResultNarrowingStep[] {
  const steps = new Map<string, AutomationStudioResultNarrowingStep>();
  for (const read of reads ?? []) for (const step of read.narrowedBefore ?? []) if (!steps.has(step.nodeId)) steps.set(step.nodeId, step);
  return [...steps.values()];
}

/** The labels of the rows Core's reads left out, and, with the record, every row it holds or saw (t686). */
function rowLabels(reads: readonly AutomationStudioResultReadAccount[] | undefined, record: AutomationStudioResultNoRecord | undefined): string[] {
  const labels = new Set<string>();
  for (const read of reads ?? []) {
    // A left-out row is said `label — column: value` where its read tested a column: the label is before the dash.
    for (const condition of read.conditions ?? []) for (const row of condition.leftOutOnlyByThis ?? []) labels.add(row.split(" — ")[0]!);
    for (const together of read.leftOutTogether ?? []) for (const row of together.rows) labels.add(row);
  }
  for (const row of record?.stored ?? []) labels.add(row.label);
  for (const pool of record?.pools ?? []) for (const label of pool) labels.add(label);
  return [...labels].map((label) => label.trim()).filter((label) => label.length > 3).sort((one, two) => two.length - one.length);
}

/** A quoted text: double or curly quotes, or single quotes not inside a word. */
const QUOTED = /"([^"]+)"|“([^”]+)”|(?<![\p{L}\p{N}])'([^']+?)'(?![\p{L}\p{N}])/gu;

/** A part with the rows it names taken out (t686): each row label, and each quoted text that is no step's own words; and whether it named one. */
function withoutRows(part: string, rows: readonly string[], steps: readonly AutomationStudioResultNarrowingStep[]): { text: string; namedRow: boolean } {
  let namedRow = false;
  const stepWords = new Set(steps.flatMap((step) => [step.label, step.chose, step.group, step.nodeId, shortId(step.nodeId)]).filter((words): words is string => !!words).map(fold));
  let text = part.replace(QUOTED, (whole, double?: string, curly?: string, single?: string) => {
    if (stepWords.has(fold(double ?? curly ?? single ?? ""))) return whole;
    namedRow = true;
    return " ";
  });
  for (const label of rows) {
    const at = new RegExp(escaped(label), "giu");
    if (!at.test(text)) continue;
    namedRow = true;
    text = text.replace(at, " ");
  }
  return { text, namedRow };
}

/** Whether a sentence names the step: its label, node id (whole or its last segment), group or the option it chose, as words of their own. */
function names(sentence: string, step: AutomationStudioResultNarrowingStep): boolean {
  const said = ` ${fold(sentence)} `;
  return [step.label, step.nodeId, shortId(step.nodeId), step.group, step.chose].some((words) => {
    const folded = words === undefined ? "" : fold(words);
    return folded.length > 1 && new RegExp(`[^\\p{L}\\p{N}]${escaped(folded)}[^\\p{L}\\p{N}]`, "u").test(said);
  });
}

/** A dotted node id's last segment, as a judge shortens it; nothing for an id without dots. */
function shortId(nodeId: string): string | undefined {
  const at = nodeId.lastIndexOf(".");
  return at > 0 && at < nodeId.length - 1 ? nodeId.slice(at + 1) : undefined;
}

/** The option's words, where they are the request's own (`../refuted-no/request-text-test.ts`); nothing otherwise. */
function requestWords(chose: string, requestText: string, says: (text: string) => boolean): string[] | undefined {
  // The test reads a condition's wording; the option is tested as a positive text test of its words.
  return automationStudioResultRequestTextTest(`option contains ${JSON.stringify(chose)}`, requestText, says);
}

/** The split facets among `steps` (`./split-facets.ts`), by their request words. */
function splitFacets(steps: readonly AutomationStudioResultNarrowingStep[], requestText: string, says: (text: string) => boolean): Map<string, AutomationStudioResultSplitFacet> {
  return automationStudioResultSplitFacets(steps, requestText, (step) => (step.chose ? requestWords(step.chose, requestText, says) : undefined));
}

/**
 * Core's words for one step: what it chose, in which group, what it left out
 * and the page's counts; that the request says those words, but for a split
 * facet, whose words say instead what its option's words do not show (header, t686).
 */
function sentence(step: AutomationStudioResultNarrowingStep, texts: readonly string[], facet?: AutomationStudioResultSplitFacet): string {
  const left = (step.leftOptions ?? []).map((option) => `"${option.words}"${option.count !== undefined ? ` (${option.count})` : ""}`);
  const counts = step.resultCount?.before !== undefined && step.resultCount.after !== undefined
    ? ` The page stated ${step.resultCount.before} results before it and ${step.resultCount.after} after.` : "";
  const leftOut = left.length ? ` The options it left unchosen: ${left.join(", ")}.` : " It left no other option of that group.";
  if (facet) {
    const others = facet.others.map((other) => `"${other.chose}" in "${other.group}"`).join(", ");
    return `${stepName(step)} chose "${step.chose}" in "${step.group}".${leftOut}${counts} Its option is one word of the request's "${facet.clause}", as is ${others} in another group: `
      + "a site filter's option words do not show that each kept row meets that part of the request; a row's own text does.";
  }
  return `${stepName(step)} chose "${step.chose}" in "${step.group}", and the request itself says ${texts.map((text) => `"${text}"`).join(" and ")}.${leftOut}${counts}`;
}

function stepName(step: AutomationStudioResultNarrowingStep): string {
  return step.label ? `"${step.label}"` : `Step ${step.nodeId}`;
}

function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").trim();
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
