// Which attempt a stale target's re-acquire comes before (t786, design D2).

/**
 * The attempt number a re-acquire runs immediately before: 4 when a node has
 * at least four attempts (the first attempt and two failed retries, then the
 * third retry is the fresh one), else the last attempt when it has at least
 * two, else none. A Flow that lowered its retries still gets one fresh attempt,
 * before its last.
 */
export function automationStudioReacquireBeforeAttempt(maxAttempts: number): number | undefined {
  if (!Number.isFinite(maxAttempts)) return undefined;
  const attempts = Math.floor(maxAttempts);
  if (attempts >= 4) return 4;
  return attempts >= 2 ? attempts : undefined;
}
