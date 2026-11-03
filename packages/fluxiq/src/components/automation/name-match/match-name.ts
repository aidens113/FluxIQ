import type { AutomationStudioNameCandidate } from "./candidate.ts";
import type { AutomationStudioNameMatch } from "./match.ts";
import { normalizeAutomationStudioName } from "./normalize.ts";
import { AUTOMATION_STUDIO_NAME_MATCH_SCORE_FLOOR } from "./score-floor.ts";
import { automationStudioNameSimilarity } from "./similarity.ts";

/**
 * How much a matching value shape is worth when ranking. It is deliberately
 * smaller than any difference two meaningfully different names produce, so the
 * shape settles a tie and never outvotes a clearly better name.
 */
const SHAPE_TIE_BREAK = 0.02;

/**
 * Resolves a written name against the names that actually exist, and says how
 * much of the answer was a guess.
 *
 * Exact first, then equal-after-normalising, then the nearest scored match
 * above `AUTOMATION_STUDIO_NAME_MATCH_SCORE_FLOOR`. `undefined` means nothing
 * plausible was written — not that matching is unavailable.
 *
 * A name that resolves because one of its words stands for another — `url`
 * where the candidate is called `link` — comes back `nearest` and never
 * `normalized`: a synonym is a guess, while `normalized` promises the caller
 * the same name spelled differently. `./synonyms.ts` holds that vocabulary and
 * the argument for keeping it small.
 *
 * `options.valueShape` is what the caller is about to put in this slot. Where
 * two candidates are otherwise equally close, the one that accepts that shape
 * wins; where one name is clearly better, the shape does not move it. Scores
 * are reported before the tie-break, so the number means name similarity and
 * nothing else.
 */
export function automationStudioMatchName(
  written: string,
  candidates: readonly AutomationStudioNameCandidate[],
  options?: { valueShape?: AutomationStudioNameCandidate["accepts"] }
): AutomationStudioNameMatch | undefined {
  if (candidates.length === 0) return undefined;
  const wantedShape = options?.valueShape;

  const exact = preferShape(candidates.filter((candidate) => candidate.id === written), wantedShape);
  if (exact) return { id: exact.id, how: "exact", score: 1 };

  const normalizedWritten = normalizeAutomationStudioName(written);
  if (normalizedWritten.length === 0) return undefined;

  const normalized = preferShape(
    candidates.filter((candidate) => normalizeAutomationStudioName(candidate.id) === normalizedWritten),
    wantedShape
  );
  if (normalized) return { id: normalized.id, how: "normalized", score: 1 };

  let best: { id: string; score: number; ranked: number } | undefined;
  for (const candidate of candidates) {
    const score = automationStudioNameSimilarity(normalizedWritten, normalizeAutomationStudioName(candidate.id));
    if (score < AUTOMATION_STUDIO_NAME_MATCH_SCORE_FLOOR) continue;
    const ranked = score + (acceptsShape(candidate, wantedShape) ? SHAPE_TIE_BREAK : 0);
    // `<=` keeps the first candidate on a tie, so the caller's order decides.
    if (best && ranked <= best.ranked) continue;
    best = { id: candidate.id, score, ranked };
  }

  return best ? { id: best.id, how: "nearest", score: Math.round(best.score * 1000) / 1000 } : undefined;
}

/** The first candidate accepting the wanted shape, else the first of them. */
function preferShape(
  candidates: readonly AutomationStudioNameCandidate[],
  wantedShape: AutomationStudioNameCandidate["accepts"]
): AutomationStudioNameCandidate | undefined {
  return candidates.find((candidate) => acceptsShape(candidate, wantedShape)) ?? candidates[0];
}

/** `unknown` on either side is an absence of information, not a shape. */
function acceptsShape(candidate: AutomationStudioNameCandidate, wantedShape: AutomationStudioNameCandidate["accepts"]): boolean {
  if (wantedShape === undefined || wantedShape === "unknown") return false;
  if (candidate.accepts === undefined || candidate.accepts === "unknown") return false;
  return candidate.accepts === wantedShape;
}
