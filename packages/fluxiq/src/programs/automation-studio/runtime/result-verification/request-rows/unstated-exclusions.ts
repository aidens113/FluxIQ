// The exclusions a judge's advice adds that the request never states (t515).
//
// **Why.** Live run `run-mv6v2hx5-f448e662` (fix 4): on a correct result, one
// judge said yes and the other no, advising a condition "excluding accessories
// such as the ... row" the request never asked for. The split left the trial
// unsure, the builder was handed the no's advice, followed it, and the next
// revision left out a row the request asks for.
//
// **The rule, and nothing read from a model.** An exclusion is the words an
// advice says to leave out: after "exclude", "filter out", "leave out", "rule
// out" or a negated test ("not contains", "does not include"), up to the end of
// its clause; or before a passive "is excluded", "are left out". Not after a
// negation ("do not exclude", "should not be left out"), and never "remove" or
// "drop", which an advice says of a condition as often as of rows. It is
// unstated when it has words of its own (`request-wording.ts`: not the words
// any list request uses, nor the words the request searched by) and none of
// them is the request's. "Excluding sponsored rows" under a request that says
// "leaving out sponsored placements" is stated; "excluding accessories" under
// the same request is not. An exclusion made only of the words the request
// searched by has no words of its own, so it is not marked: whether it leaves
// out anything the request asks for is the left-out rows' to show.
//
// **Nor one the Flow already applies (t624).** A8 bigbox `run-mv96rz68-532f5e52`
// step 0029: "Keep ... condition 4 (name not contains Holder)" was read as
// adding "not contains Holder", and the call was asked again over advice that
// changes nothing. An exclusion whose own words are exactly those of a text a
// condition of the judged result already leaves rows out by
// (`applied-exclusions.ts`) is not marked: keeping it, or adding it again,
// leaves out nothing more. One that names less or more is still marked.
// Whether that condition is the request's is what its own left-out rows are
// held to.

import type { AutomationStudioRequestWording } from "./request-wording.ts";

/** The most words of an exclusion read after or before its cue: a clause, not the rest of the advice. */
const MOST_WORDS = 10;

/** Where an exclusion's words stop: the end of its clause. */
const CLAUSE_END = /[.;:!?()\n]/u;

/** A cue that the words after it are left out: an exclusion verb, or a negated test. */
const AFTER_CUE = /(?:\bexclud(?:e|es|ed|ing)|\b(?:filter(?:s|ed|ing)?|leav(?:e|es|ing)|rul(?:e|es|ed|ing)|weed(?:s|ed|ing)?)\s+out|(?:\bnot|\bnever|n['’]t)\s+(?:contains?|containing|includes?|including|match(?:es|ing)?|equals?|like))\b/giu;

/** A cue that the words before it are left out: a passive exclusion. */
const BEFORE_CUE = /\b(?:is|are|be|being|been|gets?|got)\s+(?:excluded|filtered\s+out|left\s+out|ruled\s+out)\b/giu;

/** A negation just before a cue, or before the passive's auxiliary: "do not exclude", "should not be left out". */
const NEGATED = /(?:\b(?:not|never|no\s+longer|stop|stops|without|instead\s+of|rather\s+than)|n['’]t)\s+(?:[\p{L}'’-]+\s+)?$/iu;

/** Each exclusion the advice adds that the request never states, as the advice words it, cue first; none when there are none. */
export function automationStudioRequestUnstatedExclusions(advice: string | undefined, wording: AutomationStudioRequestWording): string[] {
  if (!advice?.trim()) return [];
  const found: string[] = [];
  for (const match of advice.matchAll(AFTER_CUE)) {
    const start = match.index!;
    if (NEGATED.test(advice.slice(0, start))) continue;
    const target = clauseAfter(advice, start + match[0].length);
    if (unstated(target, wording)) found.push(`${match[0]} ${target}`.trim());
  }
  for (const match of advice.matchAll(BEFORE_CUE)) {
    const start = match.index!;
    if (NEGATED.test(advice.slice(0, start))) continue;
    const target = clauseBefore(advice, start);
    if (unstated(target, wording)) found.push(`${target} ${match[0]}`.trim());
  }
  return [...new Set(found)];
}

/** Whether an exclusion's words have words of their own, none of them is the request's, and no condition the result applies already leaves out by them (header). */
function unstated(target: string, wording: AutomationStudioRequestWording): boolean {
  const own = wording.ownWords(target);
  return own.length > 0 && !own.some((word) => wording.has(word)) && !wording.applied(target);
}

/** The clause's words after `from`, at most `MOST_WORDS`, as the advice wrote them. */
function clauseAfter(text: string, from: number): string {
  const rest = text.slice(from);
  const end = rest.search(CLAUSE_END);
  return firstWords(end < 0 ? rest : rest.slice(0, end), MOST_WORDS);
}

/** The clause's words before `to`, at most `MOST_WORDS`, as the advice wrote them. */
function clauseBefore(text: string, to: number): string {
  const before = text.slice(0, to);
  let start = before.length;
  while (start > 0 && !CLAUSE_END.test(before[start - 1]!)) start -= 1;
  const words = before.slice(start).trim().split(/\s+/u).filter(Boolean);
  return words.slice(-MOST_WORDS).join(" ");
}

function firstWords(text: string, most: number): string {
  return text.trim().split(/\s+/u).filter(Boolean).slice(0, most).join(" ");
}
