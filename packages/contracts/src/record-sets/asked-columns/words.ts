// The words a column name and a cell are compared by when the framework places a request's column (t1074, `./map.ts`):
// letters and digits only, lower case, each word folded to its singular, so "Bids" is "bid" and "1 bid" holds it.

/** A name's or a text's words, each lower case and singular. */
export function automationStudioRecordAskedWords(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map(singular);
}

/** Whether `words` holds `phrase` as consecutive words. */
export function automationStudioRecordAskedWordsHold(words: readonly string[], phrase: readonly string[]): boolean {
  if (!phrase.length || phrase.length > words.length) return false;
  for (let start = 0; start + phrase.length <= words.length; start += 1) {
    if (phrase.every((word, at) => words[start + at] === word)) return true;
  }
  return false;
}

function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}
