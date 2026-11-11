import type { ThreadRow } from "./rows.ts";

/**
 * The rows a search keeps: each word of `query` must be in the row's name or
 * time ("invoice", "yesterday", "nov 3"), in any case. An empty search keeps
 * every row.
 */
export function filterThreadRows(rows: readonly ThreadRow[], query: string): ThreadRow[] {
  const words = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [...rows];
  return rows.filter((row) => words.every((word) => row.search.includes(word)));
}
