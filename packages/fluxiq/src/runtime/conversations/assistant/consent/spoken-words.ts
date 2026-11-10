/**
 * One word of what a person wrote, as the consent check reads it: lowercased,
 * whether it sits inside quotation marks, and whether it is a mark that ends a
 * clause (`. ; ! ? : , ( ) —`) rather than a word.
 */
export type PanelAssistantSpokenWord = { word: string; quoted: boolean; boundary: boolean };

// A quotation mark, an apostrophe used as one (not inside a word: "don't" stays one word),
// a clause mark, or a word (letters and digits, with inner apostrophes and hyphens).
const TOKEN = /[“”«»"]|(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])|[.;!?:,()[\]—–&]|[\p{L}\p{N}](?:[\p{L}\p{N}]|['-](?=[\p{L}\p{N}]))*/gu;
const QUOTE = /^[“”«»"']$/u;

/**
 * The words of `text` in order. Punctuation is its own word, so "not." and
 * "not" are the same word, and a quotation mark is not a word at all but
 * marks the words after it as quoted until the next one (an unclosed quote
 * runs to the end, which only ever makes fewer words count as asking).
 * "&" is read as "and".
 */
export function panelAssistantSpokenWords(text: string): PanelAssistantSpokenWord[] {
  const normalized = text.toLowerCase().replace(/[‘’`´]/gu, "'");
  const words: PanelAssistantSpokenWord[] = [];
  let quoted = false;
  for (const [token] of normalized.matchAll(TOKEN)) {
    if (QUOTE.test(token)) {
      quoted = !quoted;
      continue;
    }
    if (token === "&") words.push({ word: "and", quoted, boundary: false });
    else words.push({ word: token, quoted, boundary: !/^[\p{L}\p{N}]/u.test(token) });
  }
  return words;
}
