// The request's phrases, and where a row's label names them.
//
// A phrase is two or more words the request says one after another, inside one
// of its clauses (`words.ts`): "wireless earbuds", "charging cases", "ear tips".
// A label names one where its own words run the same way, compared case- and
// plural-insensitively. At each place in a label the longest phrase starting
// there is taken, and the label is read on after it, so "Wireless Charging Case"
// names "charging case" once and nothing else.
//
// A run of words that carries nothing of its own -- "in the", "of results", a
// number -- is not a phrase: a label that happened to say "in the" before its
// item would otherwise name that first.

import { automationStudioRequestRowWords, type AutomationStudioRequestRowWord } from "./words.ts";

/** A phrase a label names: where it starts in the label's words, and its words as compared. */
export type AutomationStudioRequestPhrase = { start: number; words: string[] };

/** A request read into its phrases. */
export type AutomationStudioRequestPhrases = {
  /** The phrases a label names, in order, none overlapping, each the longest starting where it does. */
  phrasesOf(label: string): AutomationStudioRequestPhrase[];
  /** A phrase in the request's own wording, as it first says it. */
  said(words: readonly string[]): string;
  /** Whether these words are a phrase of the request that carries something of its own. */
  isPhrase(words: readonly string[]): boolean;
};

/** The longest phrase looked for: longer than any item a request names, shorter than its sentences. */
const LONGEST = 12;

/** Words that carry nothing alone; a phrase needs one word that is not among them. */
const EMPTY_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "of", "in", "on", "at", "to", "by", "for", "from", "with", "without", "and", "or", "nor", "but", "not", "no",
  "is", "are", "be", "was", "were", "it", "its", "that", "thi", "this", "these", "those", "them", "they", "their", "there",
  "each", "every", "any", "all", "only", "such", "as", "if", "even", "once", "one", "two", "up", "out", "into", "than", "then",
  "so", "do", "doe", "does", "what", "which", "who", "whose", "my", "me", "i", "you", "your", "our", "we"
]);

/** The request's phrases, from its whole text. */
export function automationStudioRequestPhrases(requestText: string): AutomationStudioRequestPhrases {
  const said = new Map<string, string>();
  const words = automationStudioRequestRowWords(requestText);
  for (let start = 0; start < words.length; start += 1) {
    for (let length = 2; length <= LONGEST && start + length <= words.length; length += 1) {
      const run = words.slice(start, start + length);
      if (run.at(-1)!.segment !== run[0]!.segment) break;
      const key = keyOf(run.map((word) => word.word));
      if (!said.has(key)) said.set(key, run.map((word) => word.raw).join(" "));
    }
  }
  const isPhrase = (candidate: readonly string[]): boolean => candidate.length >= 2 && said.has(keyOf(candidate)) && carries(candidate);
  return {
    phrasesOf: (label) => phrasesIn(automationStudioRequestRowWords(label), isPhrase),
    said: (candidate) => said.get(keyOf(candidate)) ?? candidate.join(" "),
    isPhrase
  };
}

function phrasesIn(words: readonly AutomationStudioRequestRowWord[], isPhrase: (candidate: readonly string[]) => boolean): AutomationStudioRequestPhrase[] {
  const found: AutomationStudioRequestPhrase[] = [];
  let start = 0;
  while (start < words.length) {
    let longest: string[] | undefined;
    for (let length = 2; length <= LONGEST && start + length <= words.length; length += 1) {
      const run = words.slice(start, start + length);
      if (run.at(-1)!.segment !== run[0]!.segment) break;
      const candidate = run.map((word) => word.word);
      if (isPhrase(candidate)) longest = candidate;
    }
    if (longest) {
      found.push({ start, words: longest });
      start += longest.length;
    } else {
      start += 1;
    }
  }
  return found;
}

/** Whether a run of words carries something of its own: a word with a letter that is not an empty word. */
function carries(words: readonly string[]): boolean {
  return words.some((word) => /\p{L}/u.test(word) && !EMPTY_WORDS.has(word));
}

function keyOf(words: readonly string[]): string {
  return words.join(" ");
}
