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
// missing, absent, not in the result, or were left out, dropped or excluded is
// refuted when every row it names is in the stored rows, or was left out by a
// condition Core settled for that row -- unless the sentence speaks of a
// condition, filter or bound itself, where the claim is that the condition is
// wrong, which Core's reading of the row against it does not settle. A row Core
// cannot find, or one a condition left out unsettled, is the judge's to weigh.

import type { AutomationStudioResultNoClaim, AutomationStudioResultNoNamedRows } from "./types.ts";

/** Words that say rows are not in the result, said of the run (never "should be left out"). */
const MISSING = /\b(?:is|are|was|were)\s+(?:missing|absent|not\s+(?:among|stored|kept|included|returned))\b|\bmissing\s+from\b|\babsent\s+from\b|\b(?:was|were|been|got)\s+(?:left\s+out|dropped|excluded|filtered\s+out|omitted|rejected)\b|\bnot\s+in\s+the\s+(?:stored\s+rows|result|answer|output)\b|\b(?:dropped|omitted)\s+(?:it|them|these|those|both)\b/iu;
/** Words that speak of a condition itself. */
const SPEAKS_OF_A_CONDITION = /\b(?:conditions?|filters?|bounds?|thresholds?|criteri(?:on|a)|cut-?off)\b/iu;

/** The claim a sentence makes that named rows are missing (header); nothing where it makes none or names no row. */
export function automationStudioResultMissingClaim(sentence: string, named: AutomationStudioResultNoNamedRows): AutomationStudioResultNoClaim | undefined {
  if (!MISSING.test(sentence)) return undefined;
  if (!named.stored.length && !named.leftOut.length) return named.unmatched ? { refuted: false } : undefined;
  if (named.unmatched) return { refuted: false };
  const disputesCondition = SPEAKS_OF_A_CONDITION.test(sentence);
  const findings: string[] = [];
  for (const label of new Set(named.stored.map((row) => row.label))) findings.push(`"${label}" is in the stored rows.`);
  const byLabel = new Map<string, typeof named.leftOut>();
  for (const row of named.leftOut) byLabel.set(row.label, [...(byLabel.get(row.label) ?? []), row]);
  for (const rows of byLabel.values()) {
    if (disputesCondition || !rows.every((row) => row.settled)) return { refuted: false };
    for (const row of rows) findings.push(`Core's read saw "${row.given}", and only ${row.condition} left it out: Core read that row's tested value itself, and it fails that condition as written.`);
  }
  return { refuted: true, finding: findings.join(" ") };
}
