/**
 * Words for FluxIQ's own machinery that a person was never told: the build's
 * subflows and their router, its candidates and trials, the briefs its agents
 * pass and the harness around them. Whole words, any case. Round 5 showed
 * "Using “Submit subflow”", "Whole-Flow trial could not be confirmed" and
 * "Saved candidate draft." to the person.
 */
const INTERNAL_TERM = /\b(subflows?|routers?|candidates?|briefs?|harness(?:es)?|trials?)\b/giu;

/** Each internal term `text` uses, once, as a plain reason naming it. */
export function internalTermFaults(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(INTERNAL_TERM)) found.add(match[1]!.toLowerCase());
  return [...found].map((term) => `internal term "${term}"`);
}
