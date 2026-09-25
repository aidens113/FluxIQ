import { automationStudioNameEditDistance } from "./edit-distance.ts";
import { automationStudioNameTokenOverlap } from "./token-overlap.ts";

/**
 * How the three signals are weighted. Containment leads because the misses
 * worth rescuing are mostly a name written short or long — the right tokens,
 * the wrong amount of namespace. Dice keeps a long name from being carried by
 * one shared token, and edit distance is what sees a typo inside a token,
 * where both token measures read zero.
 */
const CONTAINMENT_WEIGHT = 0.45;
const DICE_WEIGHT = 0.3;
const EDIT_WEIGHT = 0.25;

/**
 * Scores how alike two already-normalised names are, in 0..1.
 *
 * Both arguments must come from `normalizeAutomationStudioName`; this function
 * does not normalise, so separators and case would be scored as differences.
 */
export function automationStudioNameSimilarity(left: string, right: string): number {
  if (left.length === 0 || right.length === 0) return 0;
  if (left === right) return 1;

  const { dice, containment } = automationStudioNameTokenOverlap(left, right);
  const distance = automationStudioNameEditDistance(left, right);
  const editSimilarity = 1 - distance / Math.max(left.length, right.length);

  const blended = CONTAINMENT_WEIGHT * containment + DICE_WEIGHT * dice + EDIT_WEIGHT * Math.max(editSimilarity, 0);
  // A typo carries on its own, because on the names where it matters most both
  // token measures read exactly zero.
  //
  // The blend was fitted to node ids, which are several tokens long, and it
  // serves them well. A parameter name is usually one token -- `target`,
  // `value`, `url`, `timeoutMs` -- and a name misspelled inside its only token
  // shares no whole token with the right one, so containment and dice are 0
  // and the score is at most the edit weight: `targe` for `target` scored
  // 0.208 against a floor of 0.25 and was refused, which is precisely the
  // "slightly incorrect name" this matcher exists to absorb.
  return withinTypoDistance(left, right, distance) ? Math.max(blended, editSimilarity) : blended;
}

/**
 * Whether two names differ by no more than a typo's worth of characters.
 *
 * Two rather than one from five characters up, because a transposition --
 * `tagret` for `target` -- costs two under plain Levenshtein, and transposing
 * is one of the commonest ways a name comes out wrong. One below that, because
 * at three or four characters two edits is most of the name.
 *
 * The bound is on the longer name, so a short name cannot reach a long one by
 * it. A candidate this admits is still only a candidate: an exact match always
 * wins first, and the value's shape breaks a tie between two that survive.
 */
function withinTypoDistance(left: string, right: string, distance: number): boolean {
  const longest = Math.max(left.length, right.length);
  return distance > 0 && distance <= (longest <= 4 ? 1 : 2);
}
