// A reading's sentences, as its claims are weighed one by one (t607).
//
// A full stop, question or exclamation mark followed by a capital, a quote or
// a bracket ends a sentence, and so does a line break. An ellipsis does not --
// judges elide long labels, "Aurelle ... Ivory" -- nor an abbreviation, nor a
// decimal point. A semicolon does not either: a judge writes a claim and its
// reason around one ("two rows are the same pair: A and B; the second names a
// part"), and they are weighed together.

/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATIONS = /\b(e\.g|i\.e|etc|vs|approx|incl)\./giu;
/** An ellipsis, three dots or the one character. */
const ELLIPSIS = /\.{3}|…/gu;

/** The sentences of a reading (header), each trimmed; none for an empty one. */
export function automationStudioResultReadingSentences(text: string | undefined): string[] {
  if (!text?.trim()) return [];
  const kept = text.replace(ABBREVIATIONS, (match) => match.replace(/\./gu, "")).replace(ELLIPSIS, "…");
  return kept.split(/(?<=[.!?])\s+(?=["“'(\[\p{Lu}\p{N}])|\n+/u).map((sentence) => sentence.trim()).filter(Boolean);
}
