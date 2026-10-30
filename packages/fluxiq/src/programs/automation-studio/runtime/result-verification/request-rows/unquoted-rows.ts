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
// request's, so a yes still quotes the request once, in a sentence that names
// that condition -- its `condition N`, its column, or a number its bound
// writes -- and a yes that does not is held for that condition alone, its rows
// marked `bound`.
//
// **That sentence names the condition and quotes the request itself (t790).**
// Debug of `run-mvswh11y-9d462629` (D3, F1): a read's negated text test, which
// the request never states, left a row out, and five yeses over it were taken.
// Each named the condition in a sentence that quoted nothing of the request,
// beside one that quoted the request for another condition, or another of its
// clauses, and lent that quote below. Core's settled sentence asks the judge
// to quote "in a sentence that names condition N", so a settled condition is
// lent no quote: the lending below stays for a row named row by row. Nor is a
// settled condition named by a tested column that is one of the answer's own
// (`summary-reads.ts`), which a reply lists routinely.
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
//
// **And every row a read stored that kept every item it saw after an act over
// a narrower read of the same list (t692).** Such a read carries Core's flag
// (`keptEveryRow`, `../read-account/kept-every-row.ts`), with the record sets
// it stored (`storedIn`, from the run's own record of each set's writers, so
// whether a set says its collecting passes does not matter). Nothing in that
// read chose which rows the answer holds, so each row of those sets is a kept
// row Core flagged (`every_row`, `automationStudioResultKeptEveryRowFlagged`):
// held, as t663's are, to being named in a sentence that quotes the request's
// words that carry something, and, as a row another read stored is (t691), in
// one that names that read by its node id: a sentence that lists every row
// beside a quote of the bound that narrowed the act says nothing of why the
// answer holds them. A yes the converse question confirmed (t691) is
// held to it as any yes is: that both calls said yes is not that either looked
// at each row.
//
// **Never working rows (t752).** A record set of working rows
// (`../read-account/working-sets.ts`: Core flagged the read that collected it as one whose rows
// a loop walked before a later read of the same list stored the answer) is not
// the result. Its rows are no holder of a left-out row (`summary-reads.ts`, so
// no `stored` hold for a row only it holds) and no kept row Core flags here,
// even where the read that collected it also carries `keptEveryRow`. A row the
// later read's condition left out that only such a set holds is held as any
// left-out row is (above, t515): a yes that names only the answer's rows, and
// settles that condition's rows with one quote of its bound, is not held.
//
// **Rows two or more conditions left out together are held as well (F1 a),
// and a quote that names only another condition is that condition's reason
// (F1 d).** Debug of `run-mvtdoyf3-47ffaac1`: a row conditions 3 and 4 left
// out together was named by no condition's own rows, so nothing here held it,
// and three yeses were taken that gave it a reason of their own beside a quote
// of the request's one exclusion. Such a set is now one of the read's
// conditions (`summary-reads.ts`), and its rows are held to the rule above.
// And a quote whose own words (`request-wording.ts`) name another condition of
// the read -- a word it tests by (`../asked-words/condition-words.ts`): its subject, its
// tested text, its value -- and none of this condition's does not account for
// this group's rows, whether in the rows' own sentence or lent from beside
// it, as a quote beside another row is that row's reason. Only for such a
// group: a condition's own rows keep t574's lending above, a quote of one
// exclusion lent to rows the sentence beside it names. The settled rule and
// the stored rule above are unchanged. A library's example: "leaving out
// reference copies" names condition 1 (reference is absent) and not conditions
// 2 and 3 (title not contains "Calendar"; title not contains "Wall"), so it is
// no reason for the wall calendar they left out.
//
// **Except a group of conditions Core settles (t795 w1b).** Social runs
// `run-mvskodlp-9966d618` and `run-mvswewhy-e4e469d4`: two correct builds'
// yeses each quoted the request for every condition, in that condition's own
// sentence, and were held for the rows those conditions left out together,
// which no yes named one by one. Where every member of a group is a condition
// Core settles (`settledMembers`, `summary-reads.ts`), the group's rows are
// accounted for when any one settled member is -- each row of the group fails
// every member, so one stated exclusion is enough for it -- by the settled rule above: a
// sentence that itself names the member and itself quotes the request, no
// quote lent -- and, as for any group, not by a quote whose own words name
// only another condition of the read (F1 d). Its rows are then not named row
// by row. A yes that accounts for no settled member is held for the group's
// rows under each member, marked `bound`, where every member is settled, and
// row by row, as above, where one is not; a group with no settled member is
// held row by row, and a condition's own rows are judged as before. A
// library's example: rows that "reference is absent" and `format equals
// "Book"`, each settled, left out together are accounted for by "leaving out
// reference copies" in the sentence naming condition 1, though nothing quotes
// the request for condition 2.

import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import type { AutomationStudioRequestWording } from "./request-wording.ts";
import { automationStudioRequestRowNaming, automationStudioRequestTextNamesRead, automationStudioRequestTextNamesRow, type AutomationStudioRequestRowNaming } from "./row-naming.ts";
import { automationStudioRequestRowsReads, automationStudioRequestRowsStoredOf } from "./summary-reads.ts";
import { automationStudioRequestConditionWords } from "../asked-words/index.ts";
import type {
  AutomationStudioRequestRowsCondition, AutomationStudioRequestRowsKept, AutomationStudioRequestRowsRead, AutomationStudioRequestRowsSettledMember, AutomationStudioRequestRowsTest, AutomationStudioRequestRowsUnquoted
} from "./types.ts";
import { automationStudioRequestRowWordCarries, automationStudioRequestRowWords } from "./words.ts";
// The leaf, not the barrel (`summary-reads.ts`).
import { automationStudioResultReadWorkingSets } from "../read-account/working-sets.ts";

/** Where a line's sentences break: a sentence's end before the next one starts. */
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[\p{Lu}"“‘'([])/gu;

/** A quotation: in straight or curly double quotes (an empty pair included), curly single quotes, or straight single quotes not inside a word. */
const QUOTE = /"([^"\n]{0,400})"|“([^”\n]{0,400})”|‘([^’\n]{1,400})’|(?<![\p{L}\p{N}])'([^'\n]{1,400})'(?![\p{L}\p{N}])/gu;

/** One sentence of a reply, whether it quotes the request's own words, and whether it names a row of any read. */
type Sentence = { text: string; quotesRequest: boolean; namesRow?: boolean };

/**
 * A sentence a row named in it is accounted for in, that sentence with the ones
 * beside it that lent it a quote (header), and whether it quotes the request
 * itself, which is all a settled condition takes (t790).
 */
type Accounting = { text: string; beside: string; quotes: boolean };

/** Each condition with the left-out rows the reply did not name beside a quote of the request's excluding words; none when it did for all. */
export function automationStudioResultLeftOutRowsUnquoted(summary: AutomationStudioRunResultSummary, reply: string, wording: AutomationStudioRequestWording): AutomationStudioRequestRowsUnquoted[] {
  // With the rows several conditions left out together, each set one group (header, F1 a).
  const { reads } = automationStudioRequestRowsReads(summary, false, { together: true });
  const namings = reads.flatMap((read) => read.labels.map((label) => automationStudioRequestRowNaming(label, read.labels)));
  const requestQuote = (quote: string): boolean => wording.says(quote) && wording.ownWords(quote).length > 0;
  const accountingFor = accountingSentences(reply, namings, requestQuote);
  // A settled condition is accounted for by its own sentence's quote, never a lent one (header, t790).
  const quoting = accountingFor.filter((sentence) => sentence.quotes).map((sentence) => sentence.text);
  // A stored row is asked for by any of the request's words that carry something, as a kept row is (header, t663, t691).
  const storedAccounting = accountingSentences(reply, namings, carryingQuote(wording));
  return reads.flatMap((read) => {
    // A row another read stored is no copy of this read's own (header, t691).
    const elsewhere = new Map((read.storedElsewhere ?? []).map((entry) => [entry.label, entry.by]));
    const inResult = new Set(read.inResult.filter((label) => !elsewhere.has(label)));
    const where = { ...(read.step !== undefined ? { step: read.step } : {}), ...(read.nodeId !== undefined ? { nodeId: read.nodeId } : {}) };
    return read.conditions.flatMap((condition): AutomationStudioRequestRowsUnquoted[] => {
      const stored = storedUnquoted(condition, elsewhere, storedAccounting, read.labels);
      const storedHeld = stored.rows.length ? [{ ...where, condition: condition.condition, rows: stored.rows, stored: stored.by }] : [];
      // A group of settled conditions is accounted for by each of them, never row by row (header, t795 w1b).
      // Every row of a group fails every member, so one member's stated exclusion accounts for it (header).
      if (condition.settledMembers) {
        const rows = condition.rows.filter((_row, index) => !inResult.has(condition.labels[index]!));
        const quoted = condition.settledMembers.some((member) => settledMemberQuoted(read, member, reply, namings, requestQuote, wording));
        if (!rows.length || quoted) return storedHeld;
        // With every member settled and none quoted, the group is held under each member; otherwise row by row, below.
        if (condition.settledMembers.length === (condition.tests ?? []).length) {
          return [...condition.settledMembers.map((member) => ({ ...where, condition: member.condition, rows, bound: true as const, boundKind: member.kind })), ...storedHeld];
        }
      }
      // A quote that names only another condition of the read is no reason for this one's rows (header, F1 d).
      const othersOnly = condition.together ? otherConditionQuote(read, condition.tests ?? [], wording) : undefined;
      const accounting = (othersOnly ? accountingSentences(reply, namings, (quote) => requestQuote(quote) && !othersOnly(quote)) : accountingFor).map((sentence) => sentence.text);
      const settled = new Set(condition.settled?.labels ?? []);
      const rows = condition.rows.filter((_row, index) => {
        const label = condition.labels[index]!;
        if (inResult.has(label) || settled.has(label)) return false;
        const naming = automationStudioRequestRowNaming(label, read.labels);
        return !accounting.some((sentence) => automationStudioRequestTextNamesRow(sentence, naming));
      });
      const bound = boundUnquoted(condition, inResult, quoting);
      return [
        ...(rows.length ? [{ ...where, condition: condition.condition, rows }] : []),
        ...(bound.length ? [{ ...where, condition: condition.condition, rows: bound, bound: true as const, boundKind: condition.settled!.kind }] : []),
        ...storedHeld
      ];
    });
  });
}

/** Each flag with the kept rows the reply did not name in a sentence quoting the request's words (header, t663); none when it named them all. */
export function automationStudioResultKeptRowsUnquoted(flags: readonly AutomationStudioRequestRowsKept[], reply: string, wording: AutomationStudioRequestWording): AutomationStudioRequestRowsKept[] {
  if (!flags.length) return [];
  const namings = flags.flatMap((flag) => flag.pool.map((label) => automationStudioRequestRowNaming(label, flag.pool)));
  const accounting = accountingSentences(reply, namings, carryingQuote(wording));
  return flags.flatMap((flag) => {
    // A row a flagged read stored is named beside that read too, as a row another read stored is (header, t691, t692).
    const read = flag.kind === "every_row" ? flag.nodeId : undefined;
    const rows = flag.rows.filter((label) => !accounting.some((sentence) => automationStudioRequestTextNamesRow(sentence.text, automationStudioRequestRowNaming(label, flag.pool))
      && (read === undefined || automationStudioRequestTextNamesRead(sentence.beside, read))));
    return rows.length ? [{ ...flag, rows }] : [];
  });
}

/**
 * Every row a flagged read stored (header, t692): for each read that carries
 * `keptEveryRow`, one flag per record set it stored, with that set's rows by
 * label. None where the read names no set or the set shows no row.
 */
export function automationStudioResultKeptEveryRowFlagged(summary: AutomationStudioRunResultSummary): AutomationStudioRequestRowsKept[] {
  // Working rows are not the result (header, t752).
  const working = automationStudioResultReadWorkingSets(summary);
  return (summary.reads ?? []).flatMap((read) => {
    const flag = read.keptEveryRow;
    const storedIn = new Set(flag?.storedIn ?? []);
    if (!flag || !storedIn.size) return [];
    return summary.recordSets.filter((set) => storedIn.has(set.datasetId) && !working.has(set.datasetId)).flatMap((set): AutomationStudioRequestRowsKept[] => {
      const labels = [...new Set(automationStudioRequestRowsStoredOf(set).map((row) => row.label))];
      return labels.length ? [{ kind: "every_row", datasetId: set.datasetId, nodeId: read.nodeId, missing: flag.narrowerRead, rows: labels, of: set.recordCount, pool: labels }] : [];
    });
  });
}

/**
 * Whether a quote's own words name another condition of the read and none of
 * this one's (header, F1 d); nothing where this condition's words, or every
 * other condition's, are not known.
 */
function otherConditionQuote(read: AutomationStudioRequestRowsRead, mine: readonly AutomationStudioRequestRowsTest[], wording: AutomationStudioRequestWording): ((quote: string) => boolean) | undefined {
  if (!mine.length) return undefined;
  const key = (test: AutomationStudioRequestRowsTest): string => `${test.wording ?? ""}\n${test.field ?? ""}`;
  const own = new Set(mine.map(key));
  const wordsOf = (tests: readonly AutomationStudioRequestRowsTest[]): Set<string> => new Set(tests.flatMap((test) => {
    const said = automationStudioRequestConditionWords(test);
    return said ? wording.ownWords(said.text) : [];
  }));
  const these = wordsOf(mine);
  const others = wordsOf([...(read.tests ?? []), ...read.conditions.flatMap((other) => other.tests ?? [])].filter((test) => !own.has(key(test))));
  for (const word of these) others.delete(word);
  if (!these.size || !others.size) return undefined;
  return (quote) => {
    const words = wording.ownWords(quote);
    return words.some((word) => others.has(word)) && !words.some((word) => these.has(word));
  };
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
    return [{ text: sentence.text, beside: [sentence.text, ...lenders.map((lender) => lender.text)].join(" "), quotes: sentence.quotesRequest }];
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

/** A settled condition's rows still out of the result, when no sentence that itself quotes the request names the condition (header, t790); none otherwise. */
function boundUnquoted(condition: AutomationStudioRequestRowsCondition, inResult: ReadonlySet<string>, accounting: readonly string[]): string[] {
  const settled = condition.settled;
  if (!settled) return [];
  const rows = condition.rows.filter((_row, index) => settled.labels.includes(condition.labels[index]!) && !inResult.has(condition.labels[index]!));
  if (!rows.length) return [];
  return namesCondition(accounting, settled.names) ? [] : rows;
}

/**
 * Whether a group's settled member is accounted for by the settled rule
 * (header, t795 w1b): some sentence that itself quotes the request -- by a
 * quote whose own words do not name only another condition of the read (F1 d),
 * no quote lent -- names the member as its `names` say.
 */
function settledMemberQuoted(
  read: AutomationStudioRequestRowsRead, member: AutomationStudioRequestRowsSettledMember, reply: string,
  namings: readonly AutomationStudioRequestRowNaming[], requestQuote: (quote: string) => boolean, wording: AutomationStudioRequestWording
): boolean {
  const othersOnly = otherConditionQuote(read, [member.test], wording);
  const quotes = othersOnly ? (quote: string) => requestQuote(quote) && !othersOnly(quote) : requestQuote;
  const quoting = accountingSentences(reply, namings, quotes).filter((sentence) => sentence.quotes).map((sentence) => sentence.text);
  return namesCondition(quoting, member.names);
}

/** Whether a sentence names a condition by one of its word runs (t574, t790). */
function namesCondition(sentences: readonly string[], names: readonly (readonly string[])[]): boolean {
  return sentences.some((sentence) => {
    const words = automationStudioRequestRowWords(sentence).map((word) => word.word);
    return names.some((name) => contains(words, name));
  });
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
