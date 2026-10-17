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
// **Except the rows Core settled itself (t574, t599, t624).** A row a numeric
// bound left out whose value Core read as failing that bound, a row a presence
// test left out whose witness found the value absent (or, for `is absent`,
// present), or a row a text test left out whose witness found a value failing
// it (`../value-readings/settled-rows.ts`), needs no quote beside it:
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
//
// **And the rows the result keeps that Core flagged (t663).** A8 towels
// `run-mvahlxuu-760d9e28`: a kept holder, the only kept row without a value in
// an answer column and the only one whose name did not write the request's
// item phrase, passed a yes that never looked at it. A row so flagged
// (`kept-without-asked-column.ts`, `kept-not-naming-the-item.ts`) has to be
// named in a sentence that quotes the request -- read and lent as above -- and
// here the quote may be of any of the request's words that carry something,
// the words it searched by included: what asks for a kept row is the words
// that name the item, which are usually the search. Whether the row is what
// the quote asks for is the judge's to say; that it was looked at beside the
// request's words is what Core checks.
//
// **And the left-out rows another read stored (t691).** A8
// `run-mvbr0w7e-6a01c05b`: a read's condition left four rows out of what the
// Flow acted on, a later read with no condition stored all eight, and a yes
// that never said why the answer held those four was taken, because a row "in
// the result" was exempt here. Only a row the same read stored is still exempt
// (`inResult` less the read's `storedElsewhere`, `summary-reads.ts`); a row
// another read stored is held to the rules above as a left-out row, and more:
// it has to be named in a sentence that names a read that stored it, by its
// node id (`row-naming.ts`), and quotes the request -- read and lent as
// above, the quote any of the request's words that carry something, as for a
// kept row, since what is asked is why the answer holds it. A yes that does not
// is held for those rows, marked `stored` with the reads that stored them.
// Whether the quoted words ask for the row in the answer is the judge's to say;
// that the judge was made to look at each one beside the read that stored it is
// what Core checks. A library's example: renew the overdue books, then list
// the books now shown as renewed; a last read that also stores the books never
// renewed has to say, of each, why it is there.

import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import type { AutomationStudioRequestWording } from "./request-wording.ts";
import { automationStudioRequestRowNaming, automationStudioRequestTextNamesRead, automationStudioRequestTextNamesRow, type AutomationStudioRequestRowNaming } from "./row-naming.ts";
import { automationStudioRequestRowsReads } from "./summary-reads.ts";
import type { AutomationStudioRequestRowsCondition, AutomationStudioRequestRowsKept, AutomationStudioRequestRowsUnquoted } from "./types.ts";
import { automationStudioRequestRowWordCarries, automationStudioRequestRowWords } from "./words.ts";

/** Where a line's sentences break: a sentence's end before the next one starts. */
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[\p{Lu}"“‘'([])/gu;

/** A quotation: in straight or curly double quotes (an empty pair included), curly single quotes, or straight single quotes not inside a word. */
const QUOTE = /"([^"\n]{0,400})"|“([^”\n]{0,400})”|‘([^’\n]{1,400})’|(?<![\p{L}\p{N}])'([^'\n]{1,400})'(?![\p{L}\p{N}])/gu;

/** One sentence of a reply, whether it quotes the request's own words, and whether it names a row of any read. */
type Sentence = { text: string; quotesRequest: boolean; namesRow?: boolean };

/** A sentence a row named in it is accounted for in, and that sentence with the ones beside it that lent it a quote (header). */
type Accounting = { text: string; beside: string };

/** Each condition with the left-out rows the reply did not name beside a quote of the request's excluding words; none when it did for all. */
export function automationStudioResultLeftOutRowsUnquoted(summary: AutomationStudioRunResultSummary, reply: string, wording: AutomationStudioRequestWording): AutomationStudioRequestRowsUnquoted[] {
  const { reads } = automationStudioRequestRowsReads(summary);
  const namings = reads.flatMap((read) => read.labels.map((label) => automationStudioRequestRowNaming(label, read.labels)));
  const accounting = accountingSentences(reply, namings, (quote) => wording.says(quote) && wording.ownWords(quote).length > 0).map((sentence) => sentence.text);
  // A stored row is asked for by any of the request's words that carry something, as a kept row is (header, t663, t691).
  const storedAccounting = accountingSentences(reply, namings, carryingQuote(wording));
  return reads.flatMap((read) => {
    // A row another read stored is no copy of this read's own (header, t691).
    const elsewhere = new Map((read.storedElsewhere ?? []).map((entry) => [entry.label, entry.by]));
    const inResult = new Set(read.inResult.filter((label) => !elsewhere.has(label)));
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
      const stored = storedUnquoted(condition, elsewhere, storedAccounting, read.labels);
      return [
        ...(rows.length ? [{ ...where, condition: condition.condition, rows }] : []),
        ...(bound.length ? [{ ...where, condition: condition.condition, rows: bound, bound: true as const }] : []),
        ...(stored.rows.length ? [{ ...where, condition: condition.condition, rows: stored.rows, stored: stored.by }] : [])
      ];
    });
  });
}

/** Each flag with the kept rows the reply did not name in a sentence quoting the request's words (header, t663); none when it named them all. */
export function automationStudioResultKeptRowsUnquoted(flags: readonly AutomationStudioRequestRowsKept[], reply: string, wording: AutomationStudioRequestWording): AutomationStudioRequestRowsKept[] {
  if (!flags.length) return [];
  const namings = flags.flatMap((flag) => flag.pool.map((label) => automationStudioRequestRowNaming(label, flag.pool)));
  const accounting = accountingSentences(reply, namings, carryingQuote(wording)).map((sentence) => sentence.text);
  return flags.flatMap((flag) => {
    const rows = flag.rows.filter((label) => !accounting.some((sentence) => automationStudioRequestTextNamesRow(sentence, automationStudioRequestRowNaming(label, flag.pool))));
    return rows.length ? [{ ...flag, rows }] : [];
  });
}

/** Whether a quote is of the request's words that carry something, the words it searched by included (header, t663). */
function carryingQuote(wording: AutomationStudioRequestWording): (quote: string) => boolean {
  return (quote) => wording.says(quote) && automationStudioRequestRowWords(quote).some((word) => automationStudioRequestRowWordCarries(word.word));
}

/**
 * The reply's sentences a row named in them is accounted for in: one that
 * quotes the request as `quotes` reads a quote, or sits, in the same line,
 * beside one that does and names no row of `namings` (header). Each comes with
 * itself and the sentences that lent it a quote, where a read that stored the
 * row may be named instead (t691).
 */
function accountingSentences(reply: string, namings: readonly AutomationStudioRequestRowNaming[], quotes: (quote: string) => boolean): Accounting[] {
  const lines = reply.split(/\n+/u).map((line) => sentencesOf(line, quotes).map((sentence) => ({ ...sentence, namesRow: namings.some((naming) => automationStudioRequestTextNamesRow(sentence.text, naming)) })));
  const lends = (sentence: Sentence | undefined): boolean => sentence?.quotesRequest === true && sentence.namesRow === false;
  return lines.flatMap((line) => line.flatMap((sentence, at) => {
    const lenders = [line[at - 1], line[at + 1]].flatMap((beside) => beside && lends(beside) ? [beside] : []);
    if (!sentence.quotesRequest && !lenders.length) return [];
    return [{ text: sentence.text, beside: [sentence.text, ...lenders.map((lender) => lender.text)].join(" ") }];
  }));
}

/**
 * A condition's left-out rows another read stored that no accounting sentence
 * names beside a read that stored them (header, t691), and those reads; none
 * when it named them all.
 */
function storedUnquoted(condition: AutomationStudioRequestRowsCondition, elsewhere: ReadonlyMap<string, readonly string[]>, accounting: readonly Accounting[], pool: readonly string[]): { rows: string[]; by: string[] } {
  if (!elsewhere.size) return { rows: [], by: [] };
  const by = new Set<string>();
  const rows = condition.rows.filter((_row, index) => {
    const reads = elsewhere.get(condition.labels[index]!);
    if (!reads) return false;
    const naming = automationStudioRequestRowNaming(condition.labels[index]!, pool);
    const named = accounting.some((sentence) => automationStudioRequestTextNamesRow(sentence.text, naming) && reads.some((node) => automationStudioRequestTextNamesRead(sentence.beside, node)));
    if (!named) for (const node of reads) by.add(node);
    return !named;
  });
  return { rows, by: [...by] };
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
 * A line's sentences, each with whether it quotes the request as `isRequestQuote`
 * reads a quote -- for a left-out row, words of the request that are its own
 * (`request-wording.ts`). Quotations are found over the whole line first, so a
 * sentence never breaks inside one (header).
 */
function sentencesOf(line: string, isRequestQuote: (quote: string) => boolean): Sentence[] {
  const quotes = [...line.matchAll(QUOTE)].map((match) => ({ start: match.index, end: match.index + match[0].length, text: match[1] ?? match[2] ?? match[3] ?? match[4] ?? "" }));
  const breaks = [...line.matchAll(SENTENCE_BREAK)].map((match) => match.index).filter((at) => !quotes.some((quote) => at > quote.start && at < quote.end));
  const sentences: Sentence[] = [];
  let start = 0;
  for (const end of [...breaks, line.length]) {
    const text = line.slice(start, end);
    const own = quotes.filter((quote) => quote.start >= start && quote.start < end).map((quote) => quote.text).filter((quote) => quote.trim().length > 0);
    if (text.trim()) sentences.push({ text, quotesRequest: own.some(isRequestQuote) });
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
