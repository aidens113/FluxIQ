// Whether a condition that leaves out rows having something leaves them out by
// the request's own exclusion words (t660): the negative of
// `./request-text-test.ts`, which reads a positive text test.
//
// **Why.** A8 frozen pair 6 `run-mvac0nmw-52ed30b2` (fix 5): the request said
// "leave out sponsored listings", a read's `sponsored is absent` alone left out
// five rows -- four also in the result, and one on which Core's read found
// "Sponsored" -- and three judges said that condition "drops qualifying packs".
// Core accounted for a settled row by the request's words only under a positive
// text test, so the fifth row stayed unaccounted: nothing held the condition,
// nothing answered the false claim, and the builder dropped a condition the
// request asks for.
//
// **What counts, and only that.** The condition as its account words it
// (`../read-account/condition.ts`), and one of two shapes:
//
// - a presence test that keeps the rows lacking a value (`<subject> is
//   absent`, the lacking form `... is absent (a row is kept only when it has no
//   "...")`, or `<subject> not is present`): the text is the value Core's read
//   found on the left-out row (its witness), and nothing without one;
// - a negated literal text test (`<subject> not contains "t"`, or `equals`,
//   `startsWith`, `endsWith`, never `matches`), of quoted text alone: the text
//   is each text it tests, which every row it left out has.
//
// Every such text must run word for word in the request, and at every place the
// request says it an exclusion cue stands within a few words before it in the
// same clause ("leave out", "leaving out", "exclude", "without", "no", "not",
// "except", "skip", "omit", "rather than", "other than"), itself not negated
// ("do not leave out"). The request then leaves out exactly what the condition
// leaves out by Core's own reading of the row, and the texts come back as the
// request writes them. Anywhere it says them otherwise ("include reference
// copies"), the condition is the judge's to weigh, and nothing comes back.

import { automationStudioRequestRowWords, type AutomationStudioRequestRowWord } from "../request-rows/words.ts";

/** A presence test that keeps the rows lacking a value, as its account words it. */
const LACKING = /^(?:.+?) (?:is absent|not is present)(?: \(a row is kept only when it has no .*\))?$/su;
/** A negated literal text test as its account words it: subject, `not`, relation, then its quoted text or list of text. */
const NEGATED_TEXT = /^(?:.+?) not (?:contains|equals|startsWith|endsWith) ((?:\[|").*)$/su;
/** An operand of quoted text alone (`./request-text-test.ts`). */
const TEXT_OPERAND = /^(?:"[^"\\]*"|\[\s*"[^"\\]*"(?:\s*,\s*"[^"\\]*")*\s*\])$/u;
/** One quoted text of such an operand. */
const QUOTED = /"([^"\\]*)"/gu;
/** One-word exclusion cues, as compared (singular). Generic, never any site's. */
const CUES: ReadonlySet<string> = new Set([
  "exclude", "excluding", "excluded", "without", "no", "not", "never", "except", "excepting", "skip", "skipping", "omit", "omitting", "avoid", "avoiding"
]);
/** Two-word exclusion cues, as compared, each by its second word and the first words it may follow. */
const PAIRED_CUES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["out", new Set(["leave", "leaving", "left", "filter", "filtering", "rule", "ruling", "weed", "cut"])],
  ["than", new Set(["rather", "other"])]
]);
/** A negation that turns a cue right after it around: "do not leave out", "never exclude". */
const NEGATIONS: ReadonlySet<string> = new Set(["not", "no", "never", "dont", "doesnt", "didnt", "nor"]);
/** How many words may stand between a cue and the request's words: "leave out any sponsored". */
const BETWEEN = 3;

/**
 * The texts, as the request writes them, by which a condition that leaves out
 * rows having something leaves out the row whose witness Core read as
 * `witness` (header); nothing where the condition is no such test, a text is
 * not the request's, or the request says it anywhere but after an exclusion cue.
 */
export function automationStudioResultRequestExclusionTest(wording: string | undefined, witness: string | undefined, requestText: string | undefined, says: ((text: string) => boolean) | undefined): string[] | undefined {
  if (!wording || !requestText || !says) return undefined;
  const texts = testedTexts(wording, witness);
  if (!texts?.length) return undefined;
  const request = automationStudioRequestRowWords(requestText);
  const said: string[] = [];
  for (const text of texts) {
    const run = automationStudioRequestRowWords(text).map((word) => word.word);
    const spelled = says(text) ? excludedAt(request, run) : undefined;
    if (!spelled) return undefined;
    said.push(spelled);
  }
  return said;
}

/** What the condition leaves a row out for having: the witness of a presence test, the quoted texts of a negated text test. */
function testedTexts(wording: string, witness: string | undefined): string[] | undefined {
  if (LACKING.test(wording)) return witness?.trim() ? [witness.trim()] : undefined;
  const negated = NEGATED_TEXT.exec(wording);
  if (!negated || !TEXT_OPERAND.test(negated[1]!)) return undefined;
  const texts = [...negated[1]!.matchAll(QUOTED)].map((match) => match[1]!);
  return texts.every((text) => text.trim().length > 0) ? texts : undefined;
}

/**
 * The request's own spelling of `run` where it says it at least once, and at
 * every place after an exclusion cue that is not itself negated (header);
 * nothing otherwise.
 */
function excludedAt(request: readonly AutomationStudioRequestRowWord[], run: readonly string[]): string | undefined {
  if (!run.length) return undefined;
  let spelled: string | undefined;
  for (let start = 0; start + run.length <= request.length; start += 1) {
    if (!run.every((word, index) => request[start + index]!.word === word)) continue;
    if (!cuedBefore(request, start)) return undefined;
    spelled ??= request.slice(start, start + run.length).map((word) => word.raw).join(" ");
  }
  return spelled;
}

/** Whether an exclusion cue, not negated, stands within `BETWEEN` words before `start` in the same clause. */
function cuedBefore(request: readonly AutomationStudioRequestRowWord[], start: number): boolean {
  const segment = request[start]!.segment;
  for (let at = start - 1; at >= Math.max(0, start - 1 - BETWEEN); at -= 1) {
    const word = request[at]!;
    if (word.segment !== segment) return false;
    const first = cueStart(request, at);
    if (first === undefined) continue;
    const before = request.slice(Math.max(0, first - 2), first).filter((one) => one.segment === segment);
    return !before.some((one) => NEGATIONS.has(one.word));
  }
  return false;
}

/** Where the exclusion cue ending at `at` begins, or nothing where no cue ends there. */
function cueStart(request: readonly AutomationStudioRequestRowWord[], at: number): number | undefined {
  const word = request[at]!;
  const firsts = PAIRED_CUES.get(word.word);
  if (firsts) {
    const previous = request[at - 1];
    return previous && previous.segment === word.segment && firsts.has(previous.word) ? at - 1 : undefined;
  }
  return CUES.has(word.word) ? at : undefined;
}
