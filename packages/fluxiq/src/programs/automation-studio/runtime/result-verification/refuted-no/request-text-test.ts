// Whether a condition tests the request's own words (t629): a positive text
// test whose text the request says, word for word, as something it asks for.
//
// **Why.** A8 bigbox `run-mv9dcztz-f16d6b5a`: a revision stored exactly the
// rows asked for, and three of four judge calls said no, each calling rows
// "missing qualifying rows" that a condition keeping only rows whose value says
// the request's own words had left out -- rows on which Core's read found a
// value that does not say them. The no-refutation check left every such no
// standing, because a sentence that speaks of the condition is "a dispute of
// the condition" (`./missing-claim.ts`). That exemption is right where the
// condition encodes the request in words of its own; it is not where the
// condition only restates the request: then Core measured what the dispute is
// about -- the row's value does not say what the request asks for.
//
// **What counts, and only that.** The condition as its account words it
// (`../read-account/condition.ts`): one relation, `contains`, `equals`,
// `startsWith` or `endsWith` (never `matches`, a pattern), not negated, with
// text only. Every text it tests must run word for word in the request
// (`../request-rows/request-wording.ts`, `says`), and at no place the request
// says it may a word that negates, excludes or offers an alternative stand
// within a few words of it in the same clause ("not", "rather than", "leave
// out", "except", "or"): the request then asks for something other than
// exactly those words, and the condition is the judge's to weigh.

import { automationStudioRequestRowWords, type AutomationStudioRequestRowWord } from "../request-rows/index.ts";

/** A positive text test as its account words it: subject, relation, then its quoted text or list of text. */
const TEXT_TEST = /^(.+?) (not )?(contains|equals|startsWith|endsWith|matches) ((?:\[|").*)$/su;
/** An operand of quoted text alone, as `../read-account/condition.ts` writes it: one string, or a list of them; none holding a quote or an escape. */
const TEXT_OPERAND = /^(?:"[^"\\]*"|\[\s*"[^"\\]*"(?:\s*,\s*"[^"\\]*")*\s*\])$/u;
/** One quoted text of such an operand. */
const QUOTED = /"([^"\\]*)"/gu;
/** The relations that test literal text. */
const LITERAL = new Set(["contains", "equals", "startsWith", "endsWith"]);
/** Words that, near the request's words, ask for something other than exactly them. Generic, never any site's. */
const CUES: ReadonlySet<string> = new Set([
  "not", "no", "never", "without", "except", "excluding", "exclude", "excluded", "leave", "leaving", "left", "skip", "omit", "avoid",
  "rather", "instead", "unles", "unless", "other", "or", "nor", "either", "neither", "but"
]);
/** How many words before and after the request's words are read for a cue. */
const BEFORE = 3;
const AFTER = 2;

/**
 * The texts a condition tests where it tests the request's own words (header);
 * nothing where it is no positive literal text test, or any text it tests is
 * not the request's, or is said beside a cue.
 */
export function automationStudioResultRequestTextTest(wording: string | undefined, requestText: string | undefined, says: ((text: string) => boolean) | undefined): string[] | undefined {
  if (!wording || !requestText || !says) return undefined;
  const match = TEXT_TEST.exec(wording);
  if (!match || match[2] || !LITERAL.has(match[3]!)) return undefined;
  const texts = operand(match[4]!);
  if (!texts?.length) return undefined;
  const request = automationStudioRequestRowWords(requestText);
  return texts.every((text) => says(text) && clean(request, wordsOf(text))) ? texts : undefined;
}

/** The text a condition's operand writes, as a list; nothing where it is not quoted text alone, or holds an escape. */
function operand(written: string): string[] | undefined {
  if (!TEXT_OPERAND.test(written)) return undefined;
  const texts = [...written.matchAll(QUOTED)].map((match) => match[1]!);
  return texts.every((text) => text.trim().length > 0) ? texts : undefined;
}

/** Whether the request says `run` at least once, and never beside a cue in the same clause. */
function clean(request: readonly AutomationStudioRequestRowWord[], run: readonly string[]): boolean {
  if (!run.length) return false;
  let found = false;
  for (let start = 0; start + run.length <= request.length; start += 1) {
    if (!run.every((word, index) => request[start + index]!.word === word)) continue;
    found = true;
    const segment = request[start]!.segment;
    const near = [...request.slice(Math.max(0, start - BEFORE), start), ...request.slice(start + run.length, start + run.length + AFTER)];
    if (near.some((word) => word.segment === segment && CUES.has(word.word))) return false;
  }
  return found;
}

function wordsOf(text: string): string[] {
  return automationStudioRequestRowWords(text).map((word) => word.word);
}
