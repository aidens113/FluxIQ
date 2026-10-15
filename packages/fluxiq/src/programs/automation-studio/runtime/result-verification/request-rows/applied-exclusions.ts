// The exclusions a judged result's conditions already apply (t624), so a no
// whose advice says to keep one, or to add one the Flow already has, is not
// read as adding an exclusion the request never states (`unstated-exclusions.ts`).
//
// **Why.** A8 bigbox `run-mv96rz68-532f5e52`, step 0029: a no ended its advice
// "Keep ... condition 4 (name not contains Holder)". The negated test in Core's
// own naming of condition 4 was read as the advice adding the exclusion "not
// contains Holder", and the call was asked again (0030), which turned it into
// the yes that confirmed a wrong answer. Keeping a condition, or adding one
// already there, changes nothing the Flow does.
//
// **What counts as applied.** A condition of any read (`reads[].conditions`)
// or saved answer (`recordSets[].processing.conditions`) that leaves out rows
// by what it names, in Core's wording of it (`../read-account/condition.ts`):
// a negated text test leaves out each text it names (`name not contains
// ["A", "B"]`), and a test for a value's absence leaves out the rows that have
// it (`promoted is absent`, `x not is present`). An exclusion is applied when
// its own words (`request-wording.ts`, `ownWords`) are exactly the own words of
// one such text, or of such a value's name: it names what that condition
// already leaves out. One that names less -- "not contains Handle" beside
// `name not contains ["Replacement Handle"]` -- would leave out more, and one
// that names more may be a wider kind given by example ("replacement parts
// such as the Replacement Handle row"), so neither is applied. Only Core's
// wording of the Flow's own conditions is read, never a model's.

import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";

/** A negated text test, as Core words it: the subject, the relation, and its text or list of texts. */
const NEGATED_TEXT = /^.+? not (?:contains|startsWith|endsWith|matches|equals) (.+)$/su;
/** A test for a value's absence, as Core words it: what it tests, less what its read found. */
const ABSENCE = /^(.+?)(?: \(read .*\))? (?:is absent|not is present)\b/su;
const NOT_ABSENT = / not is absent\b/u;

/** Whether an exclusion's own words are exactly those of one text a condition of the result already leaves out by (header). */
export function automationStudioRequestAppliedExclusions(
  summary: AutomationStudioRunResultSummary,
  ownWords: (text: string) => string[]
): (exclusion: string) => boolean {
  const wordings = [
    ...(summary.reads ?? []).flatMap((read) => (read.conditions ?? []).map((entry) => entry.condition)),
    ...summary.recordSets.flatMap((set) => (set.processing?.conditions ?? []).map((entry) => entry.condition))
  ];
  const leftOut = wordings.flatMap((wording) => (typeof wording === "string" ? textsLeftOut(wording) : []))
    .map(ownWords)
    .filter((words) => words.length > 0);
  return (exclusion) => {
    const own = new Set(ownWords(exclusion));
    return own.size > 0 && leftOut.some((words) => new Set(words).size === own.size && words.every((word) => own.has(word)));
  };
}

/** The texts a condition's wording leaves rows out by (header); none for a condition that keeps rows by what it names. */
function textsLeftOut(wording: string): string[] {
  const negated = NEGATED_TEXT.exec(wording)?.[1];
  if (negated !== undefined) return operands(negated);
  // `not is absent` keeps the rows that have the value.
  if (NOT_ABSENT.test(wording)) return [];
  const absent = ABSENCE.exec(wording)?.[1];
  return absent === undefined ? [] : [absent];
}

/** A relation's text as Core writes it: one quoted text, or a list of them. */
function operands(written: string): string[] {
  try {
    const value: unknown = JSON.parse(written);
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return [written];
}
