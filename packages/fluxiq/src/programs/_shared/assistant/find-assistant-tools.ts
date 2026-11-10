import type { AssistantToolEntry } from "@fluxiq/contracts/program-api-inputs";

/** How many tools `findAssistantTools` returns unless told otherwise. */
const DEFAULT_LIMIT = 8;

// Words that say nothing about which tool is meant.
const STOP_WORDS: ReadonlySet<string> = new Set(["a", "an", "the", "to", "of", "for", "my", "me", "i", "this", "that", "these", "those", "in", "on", "and", "or", "please", "all", "it", "its", "with", "from", "by", "is", "are", "what", "which", "can", "you"]);

const PHRASE_WORD = 3;
const SUMMARY_WORD = 2;
const NAME_WORD = 1;
const WHOLE_PHRASE = 5;

/**
 * The tools whose phrases, summary or endpoint name share words with `query`,
 * best first: a whole phrase found in the query scores 5, a query word in a
 * phrase 3, in the summary 2, in the endpoint name 1. Ties go by name. Words
 * are compared lowercased with a plural `s` dropped. No model is involved,
 * so the same query over the same tools always returns the same list.
 */
export function findAssistantTools<T extends AssistantToolEntry>(tools: readonly T[], query: string, limit = DEFAULT_LIMIT): T[] {
  const words = new Set(wordsOf(query));
  if (words.size === 0) return [];
  const spoken = ` ${wordsOf(query, false).join(" ")} `;
  const scored: Array<{ tool: T; score: number }> = [];
  for (const tool of tools) {
    const score = scoreOf(tool, words, spoken);
    if (score > 0) scored.push({ tool, score });
  }
  scored.sort((a, b) => b.score - a.score || (a.tool.name < b.tool.name ? -1 : a.tool.name > b.tool.name ? 1 : 0));
  return scored.slice(0, Math.max(0, limit)).map((item) => item.tool);
}

function scoreOf(tool: AssistantToolEntry, words: ReadonlySet<string>, spoken: string): number {
  const phraseWords = new Set(tool.phrases.flatMap((phrase) => wordsOf(phrase)));
  const summaryWords = new Set(wordsOf(tool.summary));
  const nameWords = new Set(wordsOf(tool.endpoint));
  let score = 0;
  for (const word of words) {
    if (phraseWords.has(word)) score += PHRASE_WORD;
    if (summaryWords.has(word)) score += SUMMARY_WORD;
    if (nameWords.has(word)) score += NAME_WORD;
  }
  for (const phrase of tool.phrases) {
    const said = wordsOf(phrase, false).join(" ");
    if (said && spoken.includes(` ${said} `)) score += WHOLE_PHRASE;
  }
  return score;
}

// Lowercased words; `significant` drops stop words and a plural `s`.
function wordsOf(text: string, significant = true): string[] {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!significant) return words;
  return words.filter((word) => !STOP_WORDS.has(word)).map(singular);
}

function singular(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}
