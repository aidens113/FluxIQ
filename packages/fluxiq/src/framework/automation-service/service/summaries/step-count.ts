// How many steps a run took, from its run detail rows (state-aware recovery
// plan, C1).
//
// A Call Subflow attempt whose part's attempts are projected beside it
// (`frame-attempts.ts`) is a container: the steps are its part's, so it is not
// counted again. A call whose part ran no attempt, or that was refused before
// it ran one, is a step of its own. A run without Call Subflow counts every
// row, as it always did.

/** The rows that are steps: every row no other row names as its `parentAttemptId`. */
export function automationStudioRunDetailStepCount(attempts: readonly { attemptId: string; parentAttemptId?: string | undefined }[]): number {
  const containers = new Set<string>();
  for (const attempt of attempts) if (attempt.parentAttemptId !== undefined) containers.add(attempt.parentAttemptId);
  return containers.size ? attempts.filter((attempt) => !containers.has(attempt.attemptId)).length : attempts.length;
}
