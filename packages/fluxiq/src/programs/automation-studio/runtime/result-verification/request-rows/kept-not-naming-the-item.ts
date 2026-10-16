// Rows the result keeps whose names lack the request's own item phrase, as the
// request writes it, where every other row it keeps writes it (t663).
//
// **Why.** A8 towels `run-mvahlxuu-760d9e28`: nine kept rows were named "...
// Paper Towels, ..." and the tenth "... Paper Towel Holder, ...", a holder, not
// the item. The request asked for paper towels in those words. Both re-asked
// judges said yes without looking at the kept rows. `left-out-naming-the-item.ts`
// finds the item only where every kept row names it, so the very row to flag
// hid it; and it compares words plural-insensitively, so "Paper Towel Holder"
// names "paper towels" to it.
//
// **The rule, and nothing read from a model.** Per read (`summary-reads.ts`),
// over the labels it kept -- a run without a read account, over its stored
// labels: a phrase of the request (`request-phrases.ts`) is written by a label
// where the label's own words run as the request first writes them, case and
// punctuation set aside but not the plural, so "Towels" is not "Towel". The
// rows a label does not write it in are flagged only when they are few and the
// rest are many:
//
// - at most `max(1, floor(kept / 10))` kept rows lack it (`FEW_IN`), so a list
//   whose names vary is never a flag;
// - at least `WRITING_AT_LEAST` (four) other kept rows write it, so a short
//   list never is.
//
// Where several of the request's phrases qualify, a row is flagged once, under
// the longest. It flags; it does not judge. A row so named may still be the
// item asked for: `../verdict.ts` holds a yes to naming it, in a sentence
// quoting the request's words, and never refuses one for it.

import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import type { AutomationStudioRequestPhrases } from "./request-phrases.ts";
import { automationStudioRequestRowsReads } from "./summary-reads.ts";
import type { AutomationStudioRequestRowsKept } from "./types.ts";
import { automationStudioRequestRowWords } from "./words.ts";

/** How many kept rows in each ten may lack the phrase for them to be flagged, at least one (header). */
const FEW_IN = 10;
/** How many other kept rows must write it (header). */
const WRITING_AT_LEAST = 4;
/** The longest phrase looked for, as `request-phrases.ts` looks. */
const LONGEST = 12;

/** Each read's kept rows that alone do not write a request phrase every other kept row writes; none when there are none. */
export function automationStudioResultKeptNotNamingTheItem(summary: AutomationStudioRunResultSummary, phrases: AutomationStudioRequestPhrases): AutomationStudioRequestRowsKept[] {
  const { reads, stored } = automationStudioRequestRowsReads(summary);
  const storedLabels = [...new Set(stored.map((row) => row.label))];
  const groups = reads.length
    ? reads.map((read) => ({ at: { ...(read.step !== undefined ? { step: read.step } : {}), ...(read.nodeId !== undefined ? { nodeId: read.nodeId } : {}) }, kept: read.kept, pool: read.labels }))
    : [{ at: {}, kept: storedLabels, pool: storedLabels }];
  const said = new Set<string>();
  return groups.flatMap(({ at, kept, pool }) => flagged(kept, phrases).flatMap((flag): AutomationStudioRequestRowsKept[] => {
    const key = JSON.stringify([flag.missing, flag.rows]);
    if (said.has(key)) return [];
    said.add(key);
    return [{ kind: "item", ...at, ...flag, of: kept.length, pool }];
  }));
}

/** The phrases every kept label but a few writes, longest first, each with the labels that do not write it and are not flagged under a longer one. */
function flagged(kept: readonly string[], phrases: AutomationStudioRequestPhrases): Array<{ missing: string; rows: string[] }> {
  const labels = [...new Set(kept)];
  const few = Math.max(1, Math.floor(labels.length / FEW_IN));
  const written = labels.map((label) => writtenPhrases(label, phrases));
  const counts = new Map<string, number>();
  for (const keys of written) for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  const items = [...counts]
    .filter(([, count]) => count < labels.length && labels.length - count <= few && count >= WRITING_AT_LEAST)
    .map(([key]) => key)
    .sort((left, right) => right.split(" ").length - left.split(" ").length);
  const taken = new Set<string>();
  return items.flatMap((key) => {
    const rows = labels.filter((label, index) => !written[index]!.has(key) && !taken.has(label));
    for (const row of rows) taken.add(row);
    return rows.length ? [{ missing: phrases.said(key.split(" ")), rows }] : [];
  });
}

/** The request phrases a label writes as the request first writes them (header): each by its compared words. */
function writtenPhrases(label: string, phrases: AutomationStudioRequestPhrases): Set<string> {
  const words = automationStudioRequestRowWords(label);
  const found = new Set<string>();
  for (let start = 0; start < words.length; start += 1) {
    for (let length = 2; length <= LONGEST && start + length <= words.length; length += 1) {
      const run = words.slice(start, start + length);
      if (run.at(-1)!.segment !== run[0]!.segment) break;
      const compared = run.map((word) => word.word);
      if (!phrases.isPhrase(compared)) continue;
      const request = automationStudioRequestRowWords(phrases.said(compared)).map((word) => word.raw.toLowerCase());
      if (request.length === run.length && run.every((word, index) => word.raw.toLowerCase() === request[index])) found.add(compared.join(" "));
    }
  }
  return found;
}
