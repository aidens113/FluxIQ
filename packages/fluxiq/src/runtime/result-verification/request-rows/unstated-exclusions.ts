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
//
// **Nor one that says what a stored row it names is (t628).** A8 bigbox
// `run-mv9a4aj0-f9a81d13` step 0081: a no named a stored row whose own label
// says it is a holder, and advised keeping "only rows whose name is a pack of"
// the item asked for, "(exclude holders, dispensers and accessories)". Marked as
// an unstated exclusion, the call was asked again, said yes over the holder, and
// the Flow then failed its whole test on that same row. Narrowing to the
// request's own item is no exclusion of the no's own making; whether the request
// asks for that kind of row is the judge's call, and a word list cannot settle
// it. So where the caller gives the labels of the stored rows the no's reading
// names, an exclusion whose kind -- its words before an example ("such as",
// "like", "e.g.", "including"), or all of them where those carry nothing of
// their own -- has a word of its own that is a word of one of those labels is
// not marked: it says what that row is. One that spells the row's own name
// (the label's first four words) still is, as is one whose kind no named label
// says: "excluding accessories such as <a stored row>" stays marked.
//
// **The rows such an exclusion says what they are, kept (t633).** A8 wave 8
// `run-mv9gbsm5-2957581c`: a no that stood called a stored holder not the item
// asked for, and the next revision, which left the holder out, was judged no by
// advice to drop the very conditions that left it out. The labels of the named
// stored rows an exclusion says what they are
// (`automationStudioRequestKindExclusionLabels`) are what a build keeps of that
// no across its trials (`../standing-no/`).
//
// **Nor one that leaves out only what is not the request's own item (t660).**
// A8 frozen pair 6 `run-mvac0nmw-52ed30b2` step 0122: a no advised "excluding
// non-<item> items", where the item's words were also the words the request
// searched by. Those are no words of the exclusion's own, which left the
// negating prefix "non" as its only one: never a word of the request, so the
// exclusion was marked, the call asked again, and the re-ask lost a true claim.
// Leaving out what is not the item asked for states nothing the request does
// not: so an exclusion whose kind (as t628 reads it, before its examples) says
// a negation -- "non", "not", "but", "except", "other than", "rather than" --
// right before words the request says, and has no word of its own past that
// negation and those words but the request's (and words that point at anything
// at all: "anything", "everything"), is not marked. "Excluding accessories that
// are not <the item>" still is: "accessories" is a kind of its own.

import type { AutomationStudioRequestWording } from "./request-wording.ts";
import { automationStudioRequestRowWordCarries, automationStudioRequestRowWords, type AutomationStudioRequestRowWord } from "./words.ts";

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

/** Where an exclusion's kind ends and its examples begin (header, t628). */
const EXAMPLE_CUE = /\b(?:such\s+as|like|for\s+(?:example|instance)|including|includes?)\b|\be\.?\s?g\b/iu;

/** The fewest words of a label an exclusion must spell to name that row rather than say what it is (`row-naming.ts`). */
const NAME_WORDS = 4;

/**
 * Each exclusion the advice adds that the request never states, as the advice
 * words it, cue first; none when there are none. `namedStored` are the labels
 * of the stored rows the same reading names: an exclusion that says what one of
 * them is, is not one (header, t628).
 */
export function automationStudioRequestUnstatedExclusions(advice: string | undefined, wording: AutomationStudioRequestWording, namedStored: readonly string[] = []): string[] {
  const found = exclusionsOf(advice)
    .filter(({ target }) => unstated(target, wording) && !saysWhatNamedRowsAre(target, wording, namedStored).length)
    .map(({ said }) => said);
  return [...new Set(found)];
}

/**
 * The labels among `namedStored` -- the stored rows the same reading names --
 * that an exclusion of the advice says what they are (header, t628): its kind
 * has a word of its own that is a word of the label, and it does not spell the
 * row's name. Whether the request states that exclusion does not matter: the
 * reading calls the row a kind of thing, which is what a no that stood holds
 * across a build's trials (`../standing-no/`, t633). None without an advice.
 */
export function automationStudioRequestKindExclusionLabels(advice: string | undefined, wording: AutomationStudioRequestWording, namedStored: readonly string[]): string[] {
  return [...new Set(exclusionsOf(advice).flatMap(({ target }) => saysWhatNamedRowsAre(target, wording, namedStored)))];
}

/** Each exclusion an advice words, not negated: its words (`target`), and as the advice says it, cue first or last. */
function exclusionsOf(advice: string | undefined): Array<{ target: string; said: string }> {
  if (!advice?.trim()) return [];
  const found: Array<{ target: string; said: string }> = [];
  for (const match of advice.matchAll(AFTER_CUE)) {
    const start = match.index!;
    if (NEGATED.test(advice.slice(0, start))) continue;
    const target = clauseAfter(advice, start + match[0].length);
    found.push({ target, said: `${match[0]} ${target}`.trim() });
  }
  for (const match of advice.matchAll(BEFORE_CUE)) {
    const start = match.index!;
    if (NEGATED.test(advice.slice(0, start))) continue;
    const target = clauseBefore(advice, start);
    found.push({ target, said: `${target} ${match[0]}`.trim() });
  }
  return found;
}

/** Whether an exclusion's words have words of their own, none of them is the request's, no condition the result applies already leaves out by them, and it is no negation of the request's own item (header). */
function unstated(target: string, wording: AutomationStudioRequestWording): boolean {
  const own = wording.ownWords(target);
  return own.length > 0 && !own.some((word) => wording.has(word)) && !wording.applied(target) && !negatesTheItem(target, wording);
}

/** Words that, right before the request's item, leave out what is not that item (header, t660); "other than" and "rather than" end in "than". */
const ITEM_NEGATIONS: ReadonlySet<string> = new Set(["non", "not", "but", "except", "than"]);

/** Of those, the ones written as a word of the exclusion's own: a prefix ("non-<item>"), dropped where it negates the item. */
const OWN_NEGATIONS: ReadonlySet<string> = new Set(["non"]);

/** Words that point at anything at all, never a kind of their own: "anything that is not <the item>". */
const ANYTHING_WORDS: ReadonlySet<string> = new Set(["anything", "everything", "something", "thing", "whatever", "else"]);

/**
 * Whether an exclusion's kind leaves out only what is not the request's own
 * item (header, t660): it says a negation right before words the request says,
 * and past those negations and the pointing words it has no word of its own but
 * the request's.
 */
function negatesTheItem(target: string, wording: AutomationStudioRequestWording): boolean {
  const cut = target.search(EXAMPLE_CUE);
  const before = cut < 0 ? target : target.slice(0, cut);
  const kind = wording.ownWords(before).length ? before : target;
  const words = automationStudioRequestRowWords(kind);
  const dropped = new Set<number>();
  let negated = false;
  words.forEach((word, index) => {
    if (!ITEM_NEGATIONS.has(word.word) || !saidAfter(words, index, wording)) return;
    negated = true;
    if (OWN_NEGATIONS.has(word.word)) dropped.add(index);
  });
  if (!negated) return false;
  const rest = words.filter((word, index) => !dropped.has(index) && !ANYTHING_WORDS.has(word.word)).map((word) => word.raw).join(" ");
  return wording.ownWords(rest).every((word) => wording.has(word));
}

/** Whether, after the negation at `at` and any words that carry nothing, the same clause goes on with words the request says, one of them carrying something. */
function saidAfter(words: readonly AutomationStudioRequestRowWord[], at: number, wording: AutomationStudioRequestWording): boolean {
  const segment = words[at]!.segment;
  let start = at + 1;
  while (start < words.length && words[start]!.segment === segment && !automationStudioRequestRowWordCarries(words[start]!.word)) start += 1;
  const run: string[] = [];
  for (let index = start; index < words.length && words[index]!.segment === segment; index += 1) {
    run.push(words[index]!.raw);
    if (wording.says(run.join(" "))) return true;
  }
  return false;
}

/**
 * The named stored rows' labels whose words an exclusion's kind has a word of
 * its own of, without spelling that row's name (header, t628): the rows it
 * says what they are. None where it says what none is.
 */
function saysWhatNamedRowsAre(target: string, wording: AutomationStudioRequestWording, namedStored: readonly string[]): string[] {
  if (!namedStored.length) return [];
  const cut = target.search(EXAMPLE_CUE);
  const before = cut < 0 ? target : target.slice(0, cut);
  const kind = wording.ownWords(before).length ? before : target;
  const kindWords = wording.ownWords(kind);
  const spelled = wordsOf(kind);
  return namedStored.filter((label) => {
    const words = wordsOf(label);
    if (!words.length || runsIn(spelled, words.slice(0, Math.min(NAME_WORDS, words.length)))) return false;
    return kindWords.some((word) => words.includes(word));
  });
}

function wordsOf(text: string): string[] {
  return automationStudioRequestRowWords(text).map((word) => word.word);
}

/** Whether `run` appears word for word in `words`. */
function runsIn(words: readonly string[], run: readonly string[]): boolean {
  for (let start = 0; start + run.length <= words.length; start += 1) {
    if (run.every((word, index) => words[start + index] === word)) return true;
  }
  return false;
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
