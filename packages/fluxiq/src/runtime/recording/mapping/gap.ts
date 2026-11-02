/** Advances for every candidate, including a subsequently rejected candidate. */
export function recordingCandidateGapTracker(): (entry: { monotonicOffsetMs: number }) => number | undefined {
  let previous: number | undefined;
  return (entry) => {
    const offset = entry.monotonicOffsetMs;
    if (!Number.isFinite(offset)) return undefined;
    const gap = previous === undefined ? undefined : offset - previous;
    previous = offset;
    return gap !== undefined && gap >= 0 ? gap : undefined;
  };
}
