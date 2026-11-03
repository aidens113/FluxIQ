/**
 * Levenshtein distance between two normalised names, as a two-row dynamic
 * program. Names are a handful of tokens long, so the O(n*m) cost is trivial
 * and no dependency is worth adding for it.
 *
 * Distance catches what token overlap cannot: a single mistyped or transposed
 * character inside a token, which leaves the token sets disjoint while the
 * names are plainly the same one.
 */
export function automationStudioNameEditDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, column) => column);
  let current = new Array<number>(right.length + 1).fill(0);

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = (previous[column - 1] ?? 0) + (left[row - 1] === right[column - 1] ? 0 : 1);
      current[column] = Math.min((current[column - 1] ?? 0) + 1, (previous[column] ?? 0) + 1, substitution);
    }
    [previous, current] = [current, previous];
  }

  return previous[right.length] ?? 0;
}
