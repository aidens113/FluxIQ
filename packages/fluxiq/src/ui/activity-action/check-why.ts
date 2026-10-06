import { activityActionSentences } from "./sentences.ts";

/**
 * Core's count at the head of a result check's text
 * (`programs/automation-studio/runtime/result-verification/check-words.ts`):
 * "82 rows would be stored." for a build's test, "13 rows came back." for a run.
 */
const COUNT = /^(\d{1,9}|No) (rows?) (would be stored|came back)\.$/u;
/** The check's own reading of the result, as that text opens it. */
const FOUND = /^What it found: /u;
/** The most of the check's reading a card's reason holds. */
const MAX_CLAUSE = 140;
/** A clause's opening words that are no name, said in lower case after "but". */
const PLAIN_OPENING = /^(?:a|an|the|it|its|this|that|these|those|they|there|some|all|no|none|every|each|only|most|many|one|step|stored|rows?|nothing|several|both|neither)$/iu;
/** Where a clause joins a second one that only says more: a colon, a semicolon or a dash. */
const MORE = /\s*(?:[:;](?=\s|$)|\s[–—-]\s)/u;
/** Core's own words where the check's reading says nothing a person can read, for one row and for more. */
const NOT_ANSWERED = { one: "the check found it doesn't answer what you asked", more: "the check found they don't answer what you asked" } as const;

/**
 * The check's first finding as one plain clause: its first sentence, its
 * asides in parentheses left out, up to where it goes on to say more (a colon,
 * a semicolon, a dash), no stop at its end, in lower case unless it opens with
 * a name. Undefined when there is none, or it is too long to stand as a reason.
 */
function findingOf(sentence: string | undefined): string | undefined {
  if (sentence === undefined) return undefined;
  let plain = sentence.replace(FOUND, "");
  for (let before = ""; before !== plain;) {
    before = plain;
    plain = plain.replace(/\s*\([^()]*\)/gu, "");
  }
  const clause = plain.split(MORE)[0]!.replace(/[\s.!?,;:]+$/u, "").trim();
  if (!clause || clause.length > MAX_CLAUSE || /[()]/u.test(clause)) return undefined;
  const first = /^\S+/u.exec(clause)?.[0] ?? "";
  return PLAIN_OPENING.test(first) ? `${clause.charAt(0).toLowerCase()}${clause.slice(1)}` : clause;
}

/**
 * Why a result check refuted the result, in one line a card shows after
 * "Didn't pass: ", read from the check's text: how many rows came back or
 * would be stored, "but" the check's first finding in one plain clause ("82
 * rows would be stored, but a step kept 82 rows from 5 pages with no
 * filtering"), or Core's own words when the check's finding is not one. Null
 * when the text carries neither a count nor a finding: the client then shows
 * Core's sentence as it stands.
 *
 * Live run `run-muwansvz-a2b4a987` (R2-U-1): the build test's check read
 * "Check result / Didn't pass" with no count and no reason, while the read card
 * just above it said "Done: 82 rows". The sentences are split once
 * (`./sentences.ts`), so a finding is never cut inside its aside ("(e.g.") nor
 * glued to the sentence after it (R2-U-3).
 */
export function activityActionCheckWhy(text: string | undefined): string | null {
  const sentences = activityActionSentences(text ?? "");
  const count = sentences.map((sentence) => COUNT.exec(sentence)).find((match) => match !== null);
  const finding = findingOf(sentences.find((sentence) => FOUND.test(sentence)));
  if (!count) return finding ?? null;
  const [, number, rows, how] = count as unknown as [string, string, string, string];
  if (number === "No") return finding ? `No rows ${how}, and ${finding}` : `No rows ${how}`;
  return `${number} ${rows} ${how}, but ${finding ?? (number === "1" ? NOT_ANSWERED.one : NOT_ANSWERED.more)}`;
}
