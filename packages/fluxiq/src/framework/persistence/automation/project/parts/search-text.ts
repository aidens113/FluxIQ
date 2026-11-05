/**
 * An FTS5 match expression for a person's words: each word quoted so no operator
 * in it means anything, any of them enough, best match first by rank. Null when
 * the words hold nothing searchable.
 */
export function partSearchMatch(text: string | undefined): string | null {
  const words = (text ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const unique = [...new Set(words)].slice(0, 24);
  return unique.length ? unique.map((word) => `"${word}"`).join(" OR ") : null;
}
