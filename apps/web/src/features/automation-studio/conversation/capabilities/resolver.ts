// Turning what somebody wrote into the capability they meant.
//
// **A name this does not know resolves to its nearest match; it never
// refuses.** That is the standing rule for every name FluxIQ is handed -- a
// node, a parameter, a capability -- and it is the difference between a chat
// window that operates the panel and one that says "I do not understand that"
// at a person who described what they wanted perfectly well. The answer always
// names the capability it picked and how sure it is, so a caller can say "I
// took that as *Run a Flow*" and let the person correct it, which is a far
// better conversation than a refusal.
//
// The scoring is deliberately plain: an exact id, then a declared phrase found
// in the request, then word overlap against the id, title, phrases and summary.
// Nothing here is trying to be a parser. It is the fallback that makes a bare
// string usable, and the better path -- a model choosing an id from
// `describePanelCapabilities()` -- goes through `panelCapability(id)` directly
// and never reaches this file.

import { panelCapabilities } from "./registry";
import type { PanelCapability } from "./contract";

export type PanelCapabilityMatch = {
  capability: PanelCapability;
  /** 0 to 1. One means the request named the id outright. */
  confidence: number;
};

export type PanelCapabilityResolution = {
  /** Always present while the catalog is not empty: the nearest match, never a refusal. */
  best: PanelCapabilityMatch | null;
  /** The next best few, so a caller can offer them rather than guess again. */
  alternatives: readonly PanelCapabilityMatch[];
  /** Below this, the caller should say which one it took the request as. */
  confident: boolean;
};

/** Under this, a caller names the capability it chose instead of quietly running it. */
export const PANEL_CAPABILITY_CONFIDENT_MATCH = 0.5;

const STOP_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "and", "are", "as", "at", "be", "can", "could", "do", "does", "for", "from", "get", "give",
  "has", "have", "how", "i", "if", "in", "is", "it", "its", "just", "me", "my", "of", "on", "or", "our",
  "please", "that", "the", "their", "them", "then", "there", "these", "this", "to", "up", "want", "was",
  "we", "were", "what", "when", "which", "will", "with", "would", "you", "your"
]);

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .split(" ")
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

function normalized(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim()} `;
}

function scoreAgainst(capability: PanelCapability, request: string, requestWords: readonly string[]): number {
  const haystack = normalized(request);
  if (haystack.includes(normalized(capability.id))) return 1;

  // A declared phrase found whole in the request is the strongest signal short
  // of the id. The longest such phrase wins, so "delete the flow" beats "flow".
  let phraseScore = 0;
  for (const phrase of capability.phrases) {
    if (!haystack.includes(normalized(phrase))) continue;
    phraseScore = Math.max(phraseScore, 0.7 + Math.min(0.25, words(phrase).length * 0.08));
  }

  const vocabulary = new Set([
    ...words(capability.id),
    ...words(capability.title),
    ...capability.phrases.flatMap((phrase) => words(phrase))
  ]);
  const summary = new Set(words(capability.summary));
  let overlap = 0;
  for (const word of requestWords) {
    if (vocabulary.has(word)) overlap += 1;
    else if (summary.has(word)) overlap += 0.4;
  }
  const overlapScore = requestWords.length ? Math.min(0.65, overlap / requestWords.length * 0.65) : 0;
  return Math.max(phraseScore, overlapScore);
}

/**
 * The capability this request most likely meant.
 *
 * Ties break on declaration order, which puts the plainer capability first: the
 * catalog lists `flow.describe` before `flow.explore` and `run.execute` before
 * `run.audit` for exactly that reason.
 */
export function resolvePanelCapability(request: string): PanelCapabilityResolution {
  const requestWords = words(request);
  const ranked = panelCapabilities()
    .map((capability) => ({ capability, confidence: scoreAgainst(capability, request, requestWords) }))
    .sort((left, right) => right.confidence - left.confidence);
  const best = ranked[0] ?? null;
  return {
    best,
    alternatives: ranked.slice(1, 4).filter((match) => match.confidence > 0),
    confident: (best?.confidence ?? 0) >= PANEL_CAPABILITY_CONFIDENT_MATCH
  };
}
