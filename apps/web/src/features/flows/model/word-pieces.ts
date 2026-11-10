import type { WordPiece } from "./types";

/** `{query}`, `{seller.name}`: what the outline writes for a value read from the Flow's inputs. */
const CHIP = /\{([A-Za-z_][\w.-]*)\}/gu;

/**
 * A step's words split into text and `{input}` chips. `known` says the chip names one of the
 * Flow's inputs; another `{name}` is still a value read from elsewhere, so it stays a chip.
 */
export function wordPieces(words: string, inputs: readonly string[]): WordPiece[] {
  const pieces: WordPiece[] = [];
  let at = 0;
  for (const match of words.matchAll(CHIP)) {
    const start = match.index ?? 0;
    if (start > at) pieces.push({ kind: "text", text: words.slice(at, start) });
    const name = match[1] ?? "";
    pieces.push({ kind: "input", name, known: inputs.includes(name) });
    at = start + match[0].length;
  }
  if (at < words.length) pieces.push({ kind: "text", text: words.slice(at) });
  return pieces;
}
