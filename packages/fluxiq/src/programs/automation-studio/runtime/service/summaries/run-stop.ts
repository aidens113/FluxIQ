/**
 * The run's own stop, from the closed code its trace's failure carries, or
 * undefined when the run did not stop for a reason of its own.
 *
 * A run stopped because a lasting act's outcome is unknown carries
 * `run.outcome_uncertain` on its trace (`executor/step-loop/uncertain-stop.ts`):
 * the act may have landed and nothing settled whether it did, so the run did
 * not repeat it. The failed attempt keeps its own failure (a timeout, say),
 * which says how the act went wrong, not why the run stopped there, so the
 * run detail carries this beside it: `code` as the run's `stopCode`,
 * `statusWords` as what its summary says in place of "failed", and `reason`
 * as its terminal failure reason.
 */
export function automationStudioRunStop(failureCode: unknown): Readonly<{ code: "run.outcome_uncertain"; statusWords: string; reason: string }> | undefined {
  if (failureCode !== "run.outcome_uncertain") return undefined;
  return {
    code: failureCode,
    statusWords: "Outcome uncertain",
    reason: "Outcome uncertain: the last step may already have gone through and nothing confirmed it, so it was not repeated."
  };
}
