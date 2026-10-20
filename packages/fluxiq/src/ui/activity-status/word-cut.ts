// The longest cut of a sentence at a word end that some test of fit accepts
// (`cut-at-word.ts` says why a cut falls where a word ends). The test is the
// caller's: a count of characters for the background's bound, the width the
// text takes on screen for the overlay's card. Pure: no DOM.

const ELLIPSIS = "…";
/** What a cut never leaves hanging before its ellipsis. */
const DANGLING = /[\s,;:—–-]+$/u;
/** Quote marks a cut can leave open, each with its closing mark. */
const QUOTES: ReadonlyArray<readonly [string, string]> = [["“", "”"], ["‘", "’"], ["«", "»"]];

/**
 * The longest cut of `text` at a word end that `fits` accepts, ellipsis and
 * any closing quote included; null when not even its first word does.
 * `text` itself is never offered: the caller has already found it too long.
 */
export function longestWordCut(text: string, fits: (candidate: string) => boolean): string | null {
  const ends = wordEnds(text);
  for (let index = ends.length - 1; index >= 0; index -= 1) {
    const candidate = cutAt(text, ends[index]!);
    if (candidate !== null && fits(candidate)) return candidate;
  }
  return null;
}

/** The index after each word but the last: the places a cut may fall. */
function wordEnds(text: string): number[] {
  const ends: number[] = [];
  const space = /\s+/gu;
  for (let match = space.exec(text); match !== null; match = space.exec(text)) if (match.index > 0) ends.push(match.index);
  return ends;
}

function cutAt(text: string, end: number): string | null {
  const kept = text.slice(0, end).replace(DANGLING, "");
  if (kept === "") return null;
  return `${kept}${ELLIPSIS}${closingQuotes(kept)}`;
}

/** The closing marks of the quotes `kept` opened and did not close, innermost first. */
function closingQuotes(kept: string): string {
  let closing = "";
  for (const [open, close] of QUOTES) {
    const opened = kept.split(open).length - 1;
    const closed = kept.split(close).length - 1;
    if (opened > closed) closing += close.repeat(opened - closed);
  }
  return closing;
}
