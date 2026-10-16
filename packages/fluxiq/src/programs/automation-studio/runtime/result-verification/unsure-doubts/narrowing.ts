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
