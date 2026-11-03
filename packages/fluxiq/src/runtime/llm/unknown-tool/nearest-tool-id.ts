// The offered tool id a mistyped one most likely meant.
//
// A model that names a tool the decision did not offer is usually one edit away
// from one it did -- a dropped segment, a changed separator, a near spelling --
// so the correction is shown the closest offered id beside the full list. Pure
// string work: no tool, site or task is named here.

/** The most edits that still read as a misspelling, as a share of the longer id. */
const MAX_EDIT_SHARE = 0.5;

/** The nearest of the offered ids to the one asked for, or nothing when none is close. */
export function automationStudioLlmEvidenceNearestToolId(asked: string, offered: readonly string[]): string | undefined {
  const wanted = asked.toLowerCase();
  const lastSegment = (id: string): string => id.split(/[.:/_-]/).at(-1) ?? id;
  let best: { id: string; score: number } | undefined;
  for (const id of offered) {
    const candidate = id.toLowerCase();
    const edits = editDistance(wanted, candidate);
    const close = edits <= Math.max(3, Math.floor(Math.max(wanted.length, candidate.length) * MAX_EDIT_SHARE));
    const sameEnd = wanted.length > 0 && lastSegment(wanted) === lastSegment(candidate);
    if (!close && !sameEnd) continue;
    const score = edits - (sameEnd ? 2 : 0);
    if (!best || score < best.score) best = { id, score };
  }
  return best?.id;
}

/** Levenshtein distance between two strings. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(previous[column]! + 1, current[column - 1]! + 1, previous[column - 1]! + (a[row - 1] === b[column - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}
