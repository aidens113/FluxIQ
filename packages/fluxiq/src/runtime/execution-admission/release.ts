interface ExecutionReleaseState {
  phase: "reserving" | "active" | "releasing" | "released" | "failed";
  readonly operations: ReadonlySet<Promise<unknown>>;
  readonly cleanupErrors: readonly unknown[];
}

/** Release durable ownership only after all background failure retention finishes. */
export async function releaseExecutionReservation(state: ExecutionReleaseState, release: () => Promise<void>): Promise<void> {
  await Promise.allSettled([...state.operations]);
  try {
    await release();
  } catch (error) {
    state.phase = "failed";
    if (state.cleanupErrors.length) throw new AggregateError([...state.cleanupErrors, error], "execution_admission.abort_cleanup_failed");
    throw error;
  }
  if (state.cleanupErrors.length) {
    state.phase = "failed";
    throw new AggregateError([...state.cleanupErrors], "execution_admission.abort_cleanup_failed");
  }
  state.phase = "released";
}
