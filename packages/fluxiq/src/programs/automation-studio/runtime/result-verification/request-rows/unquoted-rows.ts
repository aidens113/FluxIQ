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
//
// **Except the rows Core settled itself (t574, t599).** A row a numeric bound
// left out whose value Core read as failing that bound, or a row a presence
// test left out whose witness found the value absent (or, for `is absent`,
// present) (`../value-readings/settled-rows.ts`), needs no quote beside it:
// Core measured it. What Core did not measure is that the condition is the
// request's, so a yes still quotes the request once, beside a sentence that
// names that condition -- its `condition N`, its column, or a number its bound
// writes -- and a yes that does not is held for that condition alone, its rows
// marked `bound`.
//
// **A row is named by Core's short id too (t599, `row-id.ts`)**, which the
// judge's copy shows before each left-out row (`row-naming.ts`). And the reads
// that prepared a subflow trial's entry are not this trial's to account for
// (`summary-reads.ts`): their rows are never held against a yes here.
//
// **Quotes are paired as the reply wrote them (t574).** From t570's offline
// replay of live run `run-mv7vmvhd-b0c18c5a`'s judges: an empty `""` in a
// reply ("Diego Alvarez ("" -- no mutual friends shown)") opened a quotation
// that closed at the next mark, so every later quotation was read inside out
// and the request's quoted words were not seen; with the `""` removed, step
// 0072's yes passed. So an empty pair is a quotation of nothing, and a
// sentence never ends inside a quotation. And judges often quote the request in
// the sentence before or after the one naming the rows ("A and B are left out.
// The request says ..."), so a row named in a sentence is accounted for by a
// quote in that sentence, or in the one either side of it within the same line
// of the reply when that sentence names no row of its own: a quote beside
// another row is that row's reason, never lent to its neighbour.

import type { AutomationStudioRunResultSummary } from "../contracts.ts";
import type { AutomationStudioRequestWording } from "./request-wording.ts";
import { automationStudioRequestRowNaming, automationStudioRequestTextNamesRow } from "./row-naming.ts";
import { automationStudioRequestRowsReads } from "./summary-reads.ts";
import type { AutomationStudioRequestRowsCondition, AutomationStudioRequestRowsUnquoted } from "./types.ts";
import { automationStudioRequestRowWords } from "./words.ts";

/** Where a line's sentences break: a sentence's end before the next one starts. */
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[\p{Lu}"“‘'([])/gu;

/** A quotation: in straight or curly double quotes (an empty pair included), curly single quotes, or straight single quotes not inside a word. */
const QUOTE = /"([^"\n]{0,400})"|“([^”\n]{0,400})”|‘([^’\n]{1,400})’|(?<![\p{L}\p{N}])'([^'\n]{1,400})'(?![\p{L}\p{N}])/gu;

/** One sentence of a reply, whether it quotes the request's own words, and whether it names a row of any read. */
type Sentence = { text: string; quotesRequest: boolean; namesRow?: boolean };

/** Each condition with the left-out rows the reply did not name beside a quote of the request's excluding words; none when it did for all. */
export function automationStudioResultLeftOutRowsUnquoted(summary: AutomationStudioRunResultSummary, reply: string, wording: AutomationStudioRequestWording): AutomationStudioRequestRowsUnquoted[] {
  const { reads } = automationStudioRequestRowsReads(summary);
  const namings = reads.flatMap((read) => read.labels.map((label) => automationStudioRequestRowNaming(label, read.labels)));
  const lines = reply.split(/\n+/u).map((line) => sentencesOf(line, wording).map((sentence) => ({ ...sentence, namesRow: namings.some((naming) => automationStudioRequestTextNamesRow(sentence.text, naming)) })));
  // The sentences a row named in them is accounted for in: one that quotes the request, or sits beside one that does and names no row (header).
  const lends = (sentence: Sentence | undefined): boolean => sentence?.quotesRequest === true && sentence.namesRow === false;
  const accounting = lines.flatMap((line) => line.filter((sentence, at) => sentence.quotesRequest || lends(line[at - 1]) || lends(line[at + 1])).map((sentence) => sentence.text));
  return reads.flatMap((read) => {
    const inResult = new Set(read.inResult);
    const where = { ...(read.step !== undefined ? { step: read.step } : {}), ...(read.nodeId !== undefined ? { nodeId: read.nodeId } : {}) };
    return read.conditions.flatMap((condition): AutomationStudioRequestRowsUnquoted[] => {
      const settled = new Set(condition.settled?.labels ?? []);
      const rows = condition.rows.filter((_row, index) => {
        const label = condition.labels[index]!;
        if (inResult.has(label) || settled.has(label)) return false;
        const naming = automationStudioRequestRowNaming(label, read.labels);
        return !accounting.some((sentence) => automationStudioRequestTextNamesRow(sentence, naming));
      });
      const bound = boundUnquoted(condition, inResult, accounting);
      return [
        ...(rows.length ? [{ ...where, condition: condition.condition, rows }] : []),
        ...(bound.length ? [{ ...where, condition: condition.condition, rows: bound, bound: true as const }] : [])
      ];
    });
  });
}

/** A settled condition's rows still out of the result, when no sentence that quotes the request, or sits beside one, names the condition (header); none otherwise. */
function boundUnquoted(condition: AutomationStudioRequestRowsCondition, inResult: ReadonlySet<string>, accounting: readonly string[]): string[] {
  const settled = condition.settled;
  if (!settled) return [];
  const rows = condition.rows.filter((_row, index) => settled.labels.includes(condition.labels[index]!) && !inResult.has(condition.labels[index]!));
  if (!rows.length) return [];
  const named = accounting.some((sentence) => {
    const words = automationStudioRequestRowWords(sentence).map((word) => word.word);
    return settled.names.some((name) => contains(words, name));
  });
  return named ? [] : rows;
}

/**
 * A line's sentences, each with whether it quotes words of the request that
 * are its own (`request-wording.ts`). Quotations are found over the whole line
 * first, so a sentence never breaks inside one (header).
 */
function sentencesOf(line: string, wording: AutomationStudioRequestWording): Sentence[] {
  const quotes = [...line.matchAll(QUOTE)].map((match) => ({ start: match.index, end: match.index + match[0].length, text: match[1] ?? match[2] ?? match[3] ?? match[4] ?? "" }));
  const breaks = [...line.matchAll(SENTENCE_BREAK)].map((match) => match.index).filter((at) => !quotes.some((quote) => at > quote.start && at < quote.end));
  const sentences: Sentence[] = [];
  let start = 0;
  for (const end of [...breaks, line.length]) {
    const text = line.slice(start, end);
    const own = quotes.filter((quote) => quote.start >= start && quote.start < end).map((quote) => quote.text).filter((quote) => quote.trim().length > 0);
    if (text.trim()) sentences.push({ text, quotesRequest: own.some((quote) => wording.says(quote) && wording.ownWords(quote).length > 0) });
    start = end;
  }
  return sentences;
}

function contains(words: readonly string[], run: readonly string[]): boolean {
  for (let start = 0; start + run.length <= words.length; start += 1) {
    if (run.every((word, index) => words[start + index] === word)) return true;
  }
  return false;
}
