/**
 * Words for FluxIQ's own machinery that a person was never told: the build's
 * router, its candidates and trials, the briefs its agents pass, the harness
 * around them, its judge and what it promotes. Whole words, any case. Round 5
 * showed "Whole-Flow trial could not be confirmed" and "Saved candidate
 * draft." to the person, and the answer-first study (B 34, F 06) "Core's own
 * record ... so no judge was asked" and "The Flow was not promoted."
 *
 * "subflow" is not here: the person says it themselves, and it is one of the
 * words the product uses for them (the answer-first plan, "The Extension").
 * "Core" is matched in that spelling only, so "core idea" reads as it should.
 */
const INTERNAL_TERM = /\b(routers?|candidates?|briefs?|harness(?:es)?|trials?|judge[sd]?|judging|promot(?:ed|es?))\b/giu;
/** The framework's own name, as a name: "Core's own record". */
const CORE_NAME = /\bCore\b/gu;

/** Each internal term `text` uses, once, as a plain reason naming it. */
export function internalTermFaults(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(INTERNAL_TERM)) found.add(match[1]!.toLowerCase());
  for (const match of text.matchAll(CORE_NAME)) found.add(match[0]);
  return [...found].map((term) => `internal term "${term}"`);
}
