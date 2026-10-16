// The request as Core holds a judge's words about it to (t515): its words in
// order, so a quote can be found in it, and the words it searched by, which say
// where to look and exclude nothing.
//
// **Why.** Live run `run-mv6v2hx5-f448e662` (everything-store gate, fixes 1 and
// 4): the request listed one exclusion. A judge read the words it searched by as
// a cohort, answered no over a correct result, and advised leaving out a row by
// words the request never states; the builder followed, and two judges then
// said yes over the narrower result, each naming the row and calling it "a
// non-earbud accessory". Nothing compared that reason with the request. A yes
// over a row a condition alone left out now quotes the request's own words that
// exclude it (`unquoted-rows.ts`), and a no's advice that excludes by words the
// request never states is marked (`unstated-exclusions.ts`, `../agreement.ts`).
//
// **The words it searched by** are the words of the request phrases every row a
// read kept names (`request-phrases.ts`): a search for a phrase brings back rows
// that name it, so a quote of it says where the rows came from, not which to
// leave out. A request phrase that every kept row names because the request asks
// for exactly those rows is read the same way; a quote that adds the words
// excluding the rest ("only", a stated kind) is what tells it apart, and the
// quote's own words are what is held to the request.

import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioRequestAppliedExclusions } from "./applied-exclusions.ts";
import { automationStudioRequestPhrases, type AutomationStudioRequestPhrases } from "./request-phrases.ts";
import { automationStudioRequestRowsReads } from "./summary-reads.ts";
import { automationStudioRequestRowWordCarries, automationStudioRequestRowWords } from "./words.ts";

/** The request, read for what a judge's words say of it. */
export type AutomationStudioRequestWording = {
  /** Whether a text's words run, word for word, somewhere in the request (case- and plural-insensitive, punctuation dropped). */
  says(text: string): boolean;
  /**
   * A text's words that state something of their own: words that carry
   * something (`words.ts`), less the words any list request uses for its rows
   * and steps ("row", "result", "page", "condition", ...) and the words the
   * request searched by (header). In order, as compared.
   */
  ownWords(text: string): string[];
  /** Whether a word, as compared, is one the request says. */
  has(word: string): boolean;
  /**
   * Whether an exclusion's own words (`ownWords`) are exactly those of one
   * text a condition of the judged result already leaves rows out by
   * (`applied-exclusions.ts`, t624): it names what the Flow already leaves
   * out. False for a text with no words of its own.
   */
  applied(text: string): boolean;
  /** The request's phrases (`request-phrases.ts`): what a kept row's name is measured against (`kept-not-naming-the-item.ts`, t663). */
  phrases: AutomationStudioRequestPhrases;
};

/**
 * Words any list request or judgement uses for its rows, steps and conditions,
 * or to point at them, never what tells one row from another. A quote or an
 * exclusion of only these states nothing of its own.
 */
const LIST_WORDS: ReadonlySet<string> = new Set([
  "row", "item", "result", "record", "entry", "entrie", "list", "listing", "page", "search", "searched", "table", "column", "value",
  "condition", "step", "filter", "clause", "read", "collect", "keep", "kept", "first", "next", "last", "name", "contain", "match",
  "equal", "like", "where", "other", "rest", "request", "requested", "unrequested", "extra", "wrong", "flow", "node", "should", "must",
  "will", "would", "can", "could", "may", "might", "also", "e", "g", "eg", "ie", "etc", "example"
]);

/** The request read for what a judge's words say of it; none when it says nothing to hold them to. */
export function automationStudioRequestWording(
  instructions: readonly Pick<AutomationStudioFlowInstruction, "title" | "body">[],
  summary: AutomationStudioRunResultSummary
): AutomationStudioRequestWording | undefined {
  // The request as the build read it (`summary-with-left-out-naming-the-item.ts` reads it the same way).
  const requestText = instructions.map((instruction) => `${instruction.title}\n${instruction.body}`).join("\n");
  const words = wordsOf(requestText);
  if (!words.some(automationStudioRequestRowWordCarries)) return undefined;
  const said = new Set(words);
  const searched = searchedWords(requestText, summary);
  const ownWords = (text: string): string[] => wordsOf(text).filter((word) => automationStudioRequestRowWordCarries(word) && !LIST_WORDS.has(word) && !searched.has(word));
  return {
    says: (text) => runs(words, wordsOf(text)),
    ownWords,
    has: (word) => said.has(word),
    applied: automationStudioRequestAppliedExclusions(summary, ownWords),
    phrases: automationStudioRequestPhrases(requestText)
  };
}

/** The words of the request phrases every kept row of a read names, over every read that kept rows (header); a subflow trial's entry reads too (`summary-reads.ts`, t599). */
function searchedWords(requestText: string, summary: AutomationStudioRunResultSummary): Set<string> {
  const phrases = automationStudioRequestPhrases(requestText);
  const searched = new Set<string>();
  for (const read of automationStudioRequestRowsReads(summary, true).reads) {
    let common: Set<string> | undefined;
    for (const label of read.kept) {
      const named = new Set(phrases.phrasesOf(label).map((phrase) => phrase.words.join(" ")));
      common = common === undefined ? named : new Set([...common].filter((key) => named.has(key)));
      if (!common.size) break;
    }
    for (const key of common ?? []) for (const word of key.split(" ")) searched.add(word);
  }
  return searched;
}

function wordsOf(text: string): string[] {
  return automationStudioRequestRowWords(text).map((word) => word.word);
}

/** Whether `run`, at least one word, appears word for word in `words`. */
function runs(words: readonly string[], run: readonly string[]): boolean {
  if (!run.length) return false;
  for (let start = 0; start + run.length <= words.length; start += 1) {
    if (run.every((word, index) => words[start + index] === word)) return true;
  }
  return false;
}
