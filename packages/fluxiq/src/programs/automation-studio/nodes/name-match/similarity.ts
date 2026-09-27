import { automationStudioNameEditDistance } from "./edit-distance.ts";
import { automationStudioNameTokenOverlap } from "./token-overlap.ts";

/**
 * How the three signals are weighted. Containment leads because the misses
 * worth rescuing are mostly a name written short or long — the right tokens,
 * the wrong amount of namespace. Dice keeps a long name from being carried by
 * one shared token, and edit distance is what sees a name mistyped as a whole,
 * which the token measures cannot reach.
 *
 * The weights have not moved since they were fitted. What the two token terms
 * are *given* has: they now count a near token and a different word for the
 * same thing at a discount (`./token-credit.ts`) rather than equal tokens
 * alone. That is what stops a written name's score falling merely because the
 * candidate it belongs to is long, and a pair whose shared tokens are all
 * spelled the same scores exactly what it scored before.
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
  // A name mistyped as a whole carries on its own, because the token measures
  // cannot always see it. `./token-credit.ts` now absorbs a typo confined to
  // one token -- `targe` for `target`, the case this carve-out was written for
  // -- so what is left to it is a slip the per-token bound will not take: a
  // transposition (`tagret` for `target`, two edits inside a six-character
  // word), a separator the model dropped so that two tokens became one
  // (`maxrecords` for `maxRecords`, which shares no token with it at all), and
  // a token mistyped inside a name long enough for two edits to be trivial
  // across it (`web.output.dom-extarct_list`). Each of those is a small number
  // of characters over the whole name while being a large fraction of one
  // token, so the two rules are complements rather than alternatives.
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
