/** Words that carry no phrase alone: a repeat with fewer than two other words ("one of the") is ordinary prose. */
const FILLER: ReadonlySet<string> = new Set(["a", "an", "the", "of", "to", "in", "on", "at", "by", "for", "and", "or", "is", "it", "its", "be", "as", "this", "that", "with", "from"]);
/** The fewest words a repeated run must have to be a stutter. */
const MIN_RUN = 3;
/** Where a display joins its parts: a headline and its line, a card's name and target, a title and its reason. */
const SEPARATOR = /\s*(?:\||·|:|—|\.(?=\s|$))\s*/u;

const wordsOf = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

/**
 * A run of at least three words, two of them more than filler, said twice
 * (the longest such run), or one
 * part of a joined display said again whole. Round 5's overlay read "Build
 * failed | Build failed: FluxIQ could not finish the Flow: I could not finish
 * this.": the headline said again, then "could not finish" twice.
 */
export function stutterFaults(text: string): string[] {
  const faults: string[] = [];
  const parts = text.split(SEPARATOR).map((part) => wordsOf(part).join(" ")).filter((part) => part.includes(" "));
  const echoed = parts.find((part, index) => parts.indexOf(part) !== index);
  if (echoed) faults.push(`repeated phrase "${echoed}"`);
  const words = wordsOf(text);
  let longest = "";
  for (let length = MIN_RUN; length <= Math.floor(words.length / 2); length += 1) {
    const seen = new Map<string, number>();
    let found = "";
    for (let start = 0; start + length <= words.length; start += 1) {
      const run = words.slice(start, start + length);
      if (run.filter((word) => !FILLER.has(word)).length < 2) continue;
      const key = run.join(" ");
      const first = seen.get(key);
      if (first === undefined) seen.set(key, start);
      else if (start - first >= length) {
        found = key;
        break;
      }
    }
    if (found) longest = found;
  }
  if (longest && !(echoed && echoed.includes(longest))) faults.push(`repeated phrase "${longest}"`);
  return faults;
}
