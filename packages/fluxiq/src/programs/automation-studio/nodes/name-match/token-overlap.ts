/** How much two normalised names share as whole tokens, from two angles. */
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
 */
export function automationStudioNameTokenOverlap(left: string, right: string): AutomationStudioNameTokenOverlapResult {
  const leftTokens = new Set(left.split(" ").filter((token) => token.length > 0));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length > 0));
  if (leftTokens.size === 0 || rightTokens.size === 0) return { dice: 0, containment: 0 };

  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;

  return {
    dice: (2 * shared) / (leftTokens.size + rightTokens.size),
    containment: shared / Math.min(leftTokens.size, rightTokens.size)
  };
}
