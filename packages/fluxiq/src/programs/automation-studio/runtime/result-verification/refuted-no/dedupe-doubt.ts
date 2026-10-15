// An unsure call's doubt that the answer's dedupe merged distinct rows, held to
// Core's record (t628).
//
// **Why.** A8 bigbox `run-mv9a4aj0-f9a81d13` step 0064: a revision that stored
// exactly the rows asked for was judged unsure because its dedupe key "can
// collapse two distinct products", naming a stored row that appeared twice on a
// page. Core's record said otherwise: the answer's own dedupe removed no row,
// and the second copy was one a condition alone left out whose label is also a
// row of the result. Beside a no, the doubt went unweighed, and the builder was
// steered off the right answer.
//
// **What Core measures, and only that.** A doubt speaks of merged rows when it
// says rows collapse or merge, or that the dedupe drops, loses or keeps only one
// of them. It is contradicted when every record set counted its repeats and
// none was removed (`record.duplicatesCounted`, `record.duplicatesRemoved`): no
// row was merged. Core's words say that count, and, for each stored row the
// doubt names that a condition alone left out another copy of, which condition
// did. A doubt over a record set that did not count its repeats, or one whose
// dedupe removed a row, is not contradicted: whether that removal was right is
// the judge's.

import type { AutomationStudioResultRepairDirective } from "../contracts.ts";
import { automationStudioResultSentenceRows } from "./named-rows.ts";
import { automationStudioResultReadingSentences } from "./sentences.ts";
import type { AutomationStudioResultNoRecord } from "./types.ts";

/** Words that say the answer's dedupe merged rows. Generic, never any site's. */
const MERGED = /\bcollaps\w*|\bmerg(?:e|es|ed|ing)\b|\b(?:dedup\w*|de-dup\w*|deduplicat\w*)\b[^.]*?\b(?:drop\w*|los(?:e|es|t|ing)|remov\w*|only\s+one|one\s+row|a\s+single\s+row)\b/iu;

/** A reading an unsure call gave, as the verification keeps it. */
type Reading = NonNullable<AutomationStudioResultRepairDirective["judgement"]>;

/** Core's words for the record that contradicts a doubt about merged rows (header); nothing where the doubt makes none or the record does not settle it. */
export function automationStudioResultDedupeDoubtContradicted(doubt: Reading | undefined, record: AutomationStudioResultNoRecord): string | undefined {
  const texts = [doubt?.expected, doubt?.observed, doubt?.advice].filter((text): text is string => typeof text === "string" && text.trim().length > 0);
  if (!texts.some((text) => MERGED.test(text))) return undefined;
  if (!record.duplicatesCounted || record.duplicatesRemoved > 0) return undefined;
  const named = new Set<string>();
  for (const text of texts) for (const sentence of automationStudioResultReadingSentences(text)) {
    for (const row of automationStudioResultSentenceRows(sentence, record).stored) named.add(row.label);
  }
  const copies = [...named].flatMap((label) => {
    const conditions = [...new Set(record.leftOut.filter((row) => row.label === label).map((row) => row.condition))];
    return conditions.length ? [`"${label}" is in the stored rows, and the other copy Core's read saw was left out by ${conditions.join(" and ")} alone, not merged by the dedupe.`] : [];
  });
  return ["The answer's own dedupe removed no row: every record set counted its repeats, and none was removed.", ...copies].join(" ");
}
