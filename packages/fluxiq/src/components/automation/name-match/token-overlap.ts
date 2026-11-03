import { automationStudioNameTokenCredit } from "./token-credit.ts";

/** How much two normalised names share as tokens, from two angles. */
export type AutomationStudioNameTokenOverlapResult = {
  /** Dice coefficient: shared tokens against the size of both names together. */
  dice: number;
  /** Shared tokens against the shorter name: 1 when one name's tokens are all in the other. */
  containment: number;
};

/**
 * Token overlap between two normalised names.
 *
 * Containment is reported separately because it is the signal that rescues the
 * common real miss: the model writes the node's short name,
 * `dom-extract-list`, where the registry holds `web.output.dom-extract-list`.
 * Every token it wrote is there, so containment is 1 while Dice is only 0.75
 * and edit distance is worse still.
 *
 * "Shared" is a weighted count, not a count of equal tokens. Each token of one
 * name is paired with at most one token of the other, best pair first, and
 * contributes what `./token-credit.ts` says that pair is worth: 1 for the same
 * token, less for a near one or for a different word naming the same thing,
 * nothing for an unrelated one. Two names whose shared tokens are all spelled
 * the same score exactly what they scored when this counted equal tokens only,
 * so nothing that already resolved has moved.
 *
 * Why the pairing is one-to-one. Without it one candidate token could answer
 * for several written ones -- `rating`, `ratings` and `ratng` would each claim
 * the same `rating`, and a name sharing one column would look like a match on
 * three. Best pair first, so an exact token is never given up to a near one
 * that happened to be examined earlier.
 */
export function automationStudioNameTokenOverlap(left: string, right: string): AutomationStudioNameTokenOverlapResult {
  const leftTokens = [...new Set(left.split(" ").filter((token) => token.length > 0))];
  const rightTokens = [...new Set(right.split(" ").filter((token) => token.length > 0))];
  if (leftTokens.length === 0 || rightTokens.length === 0) return { dice: 0, containment: 0 };

  const shared = sharedTokenWeight(leftTokens, rightTokens);

  return {
    dice: (2 * shared) / (leftTokens.length + rightTokens.length),
    containment: shared / Math.min(leftTokens.length, rightTokens.length)
  };
}

/**
 * The total credit of a best-first, one-to-one pairing of the two token lists.
 *
 * Names are a handful of tokens long, so every pair is scored and sorted rather
 * than reached for by a matching algorithm: the cost is trivial and the result
 * can be read off by hand in a test. Ties fall back to the order the tokens
 * were written in, so the answer never depends on how a set happened to
 * iterate.
 */
function sharedTokenWeight(leftTokens: readonly string[], rightTokens: readonly string[]): number {
  const pairs: { left: number; right: number; credit: number }[] = [];
  for (const [left, leftToken] of leftTokens.entries()) {
    for (const [right, rightToken] of rightTokens.entries()) {
      const credit = automationStudioNameTokenCredit(leftToken, rightToken);
      if (credit > 0) pairs.push({ left, right, credit });
    }
  }
  pairs.sort((first, second) => second.credit - first.credit || first.left - second.left || first.right - second.right);

  const claimedLeft = new Set<number>();
  const claimedRight = new Set<number>();
  let shared = 0;
  for (const pair of pairs) {
    if (claimedLeft.has(pair.left) || claimedRight.has(pair.right)) continue;
    claimedLeft.add(pair.left);
    claimedRight.add(pair.right);
    shared += pair.credit;
  }
  return shared;
}
