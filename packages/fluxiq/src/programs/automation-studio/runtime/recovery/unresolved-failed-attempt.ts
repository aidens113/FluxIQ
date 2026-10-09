/**
 * The newest failure not absorbed by a later successful attempt of its node.
 * Attempts are supplied in execution order. History and run status are never
 * changed: a graph can fail after every action fault was already recovered.
 * A failed attempt whose state already held (`stateHeld`) is its node done, so
 * it is absorbed like a success, and absorbs that node's earlier failures.
 */
export function automationStudioUnresolvedFailedAttempt<T extends { nodeId?: string; status: string; stateHeld?: unknown }>(attempts: readonly T[]): T | undefined {
  const succeeded = new Set<string>();
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index]!;
    if (attempt.status === "succeeded" || attempt.stateHeld !== undefined) {
      if (attempt.nodeId) succeeded.add(attempt.nodeId);
    } else if ((attempt.status === "failed" || attempt.status === "unknown") && (!attempt.nodeId || !succeeded.has(attempt.nodeId))) {
      return attempt;
    }
  }
  return undefined;
}
