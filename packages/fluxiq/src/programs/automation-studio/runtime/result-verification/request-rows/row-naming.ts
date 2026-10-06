// How a judge's words name a row: by a prefix of its label that tells it apart
// from every other row of its read, or by an id it carries.
//
// A judge names rows the way a person does -- "Lumo Audio Drift Pro", "Aurelle
// Echo B0J5MCMBAY" -- so a row counts as named by the shortest start of its
// label, at least four words, that no other row of the read shares, or by a
// letters-and-digits run of six or more from it that no other row holds. Four
// words, because three name a product line, and a read holds many of one line:
// live run `run-muw60j7c-bb7c9a62`'s "Aurelle Pods Fit" is three rows kept and
// one left out, and only the whole of the left-out label tells it apart.

import { automationStudioRequestRowIds, automationStudioRequestRowWords } from "./words.ts";

/** The ways a row may be named: the words of its distinguishing prefix, and its own ids. */
export type AutomationStudioRequestRowNaming = { prefix: string[]; ids: string[] };

/** The fewest words a prefix that names a row has, unless the label is shorter. */
const PREFIX_MIN_WORDS = 4;

/** How a row is named among the other rows of its read (`pool`, which may hold it too). */
export function automationStudioRequestRowNaming(label: string, pool: readonly string[]): AutomationStudioRequestRowNaming {
  const words = wordsOf(label);
  const others = [...new Set(pool)].filter((other) => other !== label);
  const otherWords = others.map(wordsOf);
  let prefix = words;
  for (let length = Math.min(PREFIX_MIN_WORDS, words.length); length <= words.length; length += 1) {
    if (!otherWords.some((other) => other.length >= length && words.slice(0, length).every((word, index) => other[index] === word))) {
      prefix = words.slice(0, length);
      break;
    }
  }
  const othersText = others.join("\n").toUpperCase();
  return { prefix, ids: automationStudioRequestRowIds(label).filter((id) => !othersText.includes(id)) };
}

/** Whether a text names a row: its distinguishing prefix, word for word, or one of its ids. */
export function automationStudioRequestTextNamesRow(text: string, naming: AutomationStudioRequestRowNaming): boolean {
  if (naming.ids.length) {
    const ids = new Set(automationStudioRequestRowIds(text));
    if (naming.ids.some((id) => ids.has(id))) return true;
  }
  return naming.prefix.length > 0 && contains(wordsOf(text), naming.prefix);
}

function wordsOf(text: string): string[] {
  return automationStudioRequestRowWords(text).map((word) => word.word);
}

function contains(words: readonly string[], run: readonly string[]): boolean {
  for (let start = 0; start + run.length <= words.length; start += 1) {
    if (run.every((word, index) => words[start + index] === word)) return true;
  }
  return false;
}
