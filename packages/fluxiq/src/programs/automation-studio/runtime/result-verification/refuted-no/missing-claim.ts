// A no's claim that rows are missing from the result (t607).
//
// **Why.** A8 everything-store `run-mv8p0p7c-c8412344`, whole test 1: one judge
// said two rows of the last page "qualify" and are absent from the stored
// rows. Core's read had seen both and left each out by a condition whose value
// Core read on that row itself -- one was a sponsored slot, the other showed no
// membership marker -- so the claim was the judge's misreading of the row, not
// a defect of the Flow.
//
// **What Core holds.** The rows the result stores, and per read and condition
// the rows that condition alone left out, with the ones Core settled: their
// tested value, read by Core, fails the condition as written
// (`../value-readings/settled-rows.ts`). A sentence saying named rows are
// missing, absent, not in the result, not included, or were left out, dropped
// or excluded is refuted when every row it names is in the stored rows, or was
// left out by a condition Core settled for that row -- unless the sentence
// speaks of a condition, filter or bound itself, where the claim is that the
// condition is wrong, which Core's reading of the row against it does not
// settle. A row Core cannot find, or one a condition left out unsettled, is the
// judge's to weigh.
//
// **Unless the condition only restates the request (t629).** A8 bigbox
// `run-mv9dcztz-f16d6b5a`: three nos over an exact answer said "missing
// qualifying rows ..." and "condition 4 ... dropped 8 rows including ...",
// every row named one a text condition alone left out whose text is the
// request's own words, word for word, and on which Core's read found a value
// failing it. The first wording was no claim here at all, and the second was
// exempt as a dispute of the condition, so a misreading of the row counted as a
// no, and two of them banned the exact revision. So the words that say rows are
// missing include the attributive and the generic forms ("missing qualifying
// rows", "Missing rows:", "not included", "should be included", "dropped 8 rows
// including"), and a sentence that speaks of the condition is still refuted
// where every row it names is settled by a condition testing the request's own
// words over a read that kept rows (`./request-text-test.ts`, `./record.ts`):
// what is disputed is then the row's value, which Core read. A condition whose
// words the request does not state stays the judge's to weigh.

import { automationStudioResultLeftOutFinding } from "./left-out-finding.ts";
import type { AutomationStudioResultNoClaim, AutomationStudioResultNoNamedRows } from "./types.ts";

/** The nouns a judge calls the result's rows by. Generic, never any site's. */
const ROWS = String.raw`(?:rows?|records?|items?|entries|listings?|products?)`;
/** Words that may stand between "missing" and the rows: generic qualifiers and counts, never a column. */
const QUALIFIERS = String.raw`(?:(?:several|some|many|other|more|the|all|\d+|qualifying|required|requested|eligible|valid|matching|expected|relevant)\s+){0,3}`;
/** Words that say rows are not in the result, said of the run (never "should be left out"). */
const MISSING = new RegExp([
  String.raw`\b(?:is|are|was|were)\s+(?:missing|absent|not\s+(?:among|stored|kept|included|returned))\b`,
  String.raw`\bmissing\s+from\b`,
  String.raw`\babsent\s+from\b`,
  String.raw`\b(?:was|were|been|got)\s+(?:left\s+out|dropped|excluded|filtered\s+out|omitted|rejected)\b`,
  String.raw`\bnot\s+in\s+the\s+(?:stored\s+rows|result|answer|output)\b`,
  String.raw`\b(?:dropped|omitted)\s+(?:it|them|these|those|both)\b`,
  // t629: the attributive and the generic forms.
  String.raw`\bmissing\s*:`,
  String.raw`\bmissing\s+${QUALIFIERS}${ROWS}\b`,
  String.raw`\bnot\s+included\b`,
  String.raw`\b(?:should|must)\s+(?:also\s+)?(?:have\s+been|be)\s+(?:included|kept|stored|listed|returned|in\s+the\s+(?:result|answer|output))\b`,
  String.raw`\bleft\s+(?:it|them|these|those|both)\s+out\b`,
  String.raw`\b(?:dropped|omitted|excluded|removed|left\s+out|filtered\s+out)\s+(?:\d+\s+)?(?:[\p{L}-]+\s+)?${ROWS}\s+(?:including|such\s+as|like)\b`
].join("|"), "iu");
/** Words that speak of a row's cell: a stored row said to lack a value is no row called missing (t629). */
const SPEAKS_OF_A_CELL = /\b(?:columns?|values?|fields?|cells?)\b/iu;
/** Words that speak of a condition itself. */
const SPEAKS_OF_A_CONDITION = /\b(?:conditions?|filters?|bounds?|thresholds?|criteri(?:on|a)|cut-?off)\b/iu;

/** The claim a sentence makes that named rows are missing (header); nothing where it makes none or names no row. */
export function automationStudioResultMissingClaim(sentence: string, named: AutomationStudioResultNoNamedRows): AutomationStudioResultNoClaim | undefined {
  if (!MISSING.test(sentence)) return undefined;
  if (!named.stored.length && !named.leftOut.length) return named.unmatched ? { refuted: false } : undefined;
  if (named.unmatched) return { refuted: false };
  // A stored row said to lack a value is a claim about its cell, which Core does not check here: the wider words above say "not included" of a column too.
  if (named.stored.length && SPEAKS_OF_A_CELL.test(sentence)) return { refuted: false };
  const disputesCondition = SPEAKS_OF_A_CONDITION.test(sentence);
  const findings: string[] = [];
  for (const label of new Set(named.stored.map((row) => row.label))) findings.push(`"${label}" is in the stored rows.`);
  const byLabel = new Map<string, typeof named.leftOut>();
  for (const row of named.leftOut) byLabel.set(row.label, [...(byLabel.get(row.label) ?? []), row]);
  for (const rows of byLabel.values()) {
    if (!rows.every((row) => row.settled)) return { refuted: false };
    // A dispute of the condition stands, unless the condition tests the request's own words and Core read the row failing them (header, t629).
    if (disputesCondition && !rows.every((row) => row.quotesRequest)) return { refuted: false };
    for (const row of rows) findings.push(automationStudioResultLeftOutFinding(row));
  }
  return { refuted: true, finding: findings.join(" ") };
}
