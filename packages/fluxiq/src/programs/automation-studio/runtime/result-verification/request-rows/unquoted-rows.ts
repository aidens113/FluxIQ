// The rows a condition alone left out that a judge's yes did not account for by
// the request's own words (t515).
//
// **Why.** Live run `run-mv6v2hx5-f448e662`: a request listed one exclusion, a
// read's second condition left out one more row, and both build-test judges
// said yes, each naming that row and giving a reason of its own ("an
// accessory"), not the request's. The named-rows guard (`unaccounted-rows.ts`)
// passed them: it asks that a row be named, never why, and it looks only at
// rows that name the asked item first.
//
// **The rule, and nothing read from a model.** Every row a condition alone left
// out of the result -- any condition, any column -- has to be named in a
// sentence of the reply (`row-naming.ts`) that also quotes, in quotation marks,
// words of the request that exclude it: the quote's words run word for word in
// the request, and some of them are its own, not only the words it searched by
// or the words any list request uses (`request-wording.ts`). A quote of the
// search alone ("garden tools") is no reason to leave a row out, and a reason
// in the judge's own words is not the request's. Whether the quoted words
// really exclude that row is the judge's to say; that the reason is the
// request's, and stands beside the row, is what Core checks.

import type { AutomationStudioRunResultSummary } from "../contracts.ts";
import type { AutomationStudioRequestWording } from "./request-wording.ts";
import { automationStudioRequestRowNaming, automationStudioRequestTextNamesRow } from "./row-naming.ts";
import { automationStudioRequestRowsReads } from "./summary-reads.ts";
import type { AutomationStudioRequestRowsUnquoted } from "./types.ts";

/** Where a reply's sentences break: a line, or a sentence's end before the next one starts. */
const SENTENCE_BREAK = /\n+|(?<=[.!?])\s+(?=[\p{Lu}"“‘'([])/u;

/** A quotation: in straight or curly double quotes, curly single quotes, or straight single quotes not inside a word. */
const QUOTE = /"([^"\n]{1,400})"|“([^”\n]{1,400})”|‘([^’\n]{1,400})’|(?<![\p{L}\p{N}])'([^'\n]{1,400})'(?![\p{L}\p{N}])/gu;

/** Each condition with the left-out rows the reply did not name beside a quote of the request's excluding words; none when it did for all. */
export function automationStudioResultLeftOutRowsUnquoted(summary: AutomationStudioRunResultSummary, reply: string, wording: AutomationStudioRequestWording): AutomationStudioRequestRowsUnquoted[] {
  // The sentences that quote the request's own words: only these can account for a row.
  const quoting = reply.split(SENTENCE_BREAK).filter((sentence) => quotesOf(sentence).some((quote) => wording.says(quote) && wording.ownWords(quote).length > 0));
  return automationStudioRequestRowsReads(summary).reads.flatMap((read) => {
    const inResult = new Set(read.inResult);
    return read.conditions.flatMap((condition): AutomationStudioRequestRowsUnquoted[] => {
      const rows = condition.rows.filter((_row, index) => {
        const label = condition.labels[index]!;
        if (inResult.has(label)) return false;
        const naming = automationStudioRequestRowNaming(label, read.labels);
        return !quoting.some((sentence) => automationStudioRequestTextNamesRow(sentence, naming));
      });
      if (!rows.length) return [];
      return [{
        ...(read.step !== undefined ? { step: read.step } : {}),
        ...(read.nodeId !== undefined ? { nodeId: read.nodeId } : {}),
        condition: condition.condition,
        rows
      }];
    });
  });
}

function quotesOf(sentence: string): string[] {
  return [...sentence.matchAll(QUOTE)].map((match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? "").filter((quote) => quote.trim().length > 0);
}
