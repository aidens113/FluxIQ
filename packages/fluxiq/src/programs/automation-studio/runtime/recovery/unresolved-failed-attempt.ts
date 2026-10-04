/**
 * The newest failure not absorbed by a later successful attempt of its node.
 * Attempts are supplied in execution order. History and run status are never
 * changed: a graph can fail after every action fault was already recovered.
 */
export function automationStudioUnresolvedFailedAttempt<T extends { nodeId?: string; status: string }>(attempts: readonly T[]): T | undefined {
  const succeeded = new Set<string>();
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index]!;
    if (attempt.status === "succeeded") {
      if (attempt.nodeId) succeeded.add(attempt.nodeId);
    } else if ((attempt.status === "failed" || attempt.status === "unknown") && (!attempt.nodeId || !succeeded.has(attempt.nodeId))) {
      return attempt;
    }
  }
  return undefined;
}
