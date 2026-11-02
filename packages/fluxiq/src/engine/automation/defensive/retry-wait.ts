/**
 * The longest one wait between two attempts of the same node.
 *
 * It matches the recorded-readiness ceiling on purpose: 30 s is the longest this
 * runtime ever holds a run up for one thing, and a second number would be a
 * second answer to the same question.
 */
export const AUTOMATION_STUDIO_MAX_RETRY_WAIT_MS = 30_000;

/**
 * The longest all the waits at one arrival at one node may add up to.
 *
 * Defaults must not turn a fast failure into a long hang. Without this bound a
 * document could ask for 25 attempts at a minute each and pin a run to one node
 * for half an hour with every check green, which is the shape of a hang, not of a
 * defence.
 */
export const AUTOMATION_STUDIO_MAX_NODE_RETRY_WAIT_MS = 60_000;

/**
 * The longest all the waits in one run may add up to.
 *
 * The per-node bound alone is not a bound on the run: a Flow may arrive at
 * hundreds of nodes, and the product of the two is hours. Past this figure the
 * default policy stops absorbing faults by waiting -- the ladder keeps every
 * other rung, and the Flow keeps its own authored error handling -- so a run that
 * is failing everywhere fails in bounded time instead of grinding.
 */
export const AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS = 300_000;

/** What one wait costs, and whether a bound shortened it. */
export type AutomationStudioRetryWait = {
  waitMs: number;
  /** True when a bound cut the wait below what the backoff table or the hint asked for. */
  bounded: boolean;
};

/**
 * The wait before the next attempt: the longer of the backoff table and the
 * source's own hint, held to the per-attempt bound, then to what this node and
 * this run have left.
 *
 * The hint wins over the table when it is longer, because a service that says
 * "not for another two seconds" knows something the table does not, and ignoring
 * it earns another refusal. The bounds win over both, because a remote service
 * does not own the clock of the run.
 */
export function automationStudioBoundedRetryWaitMs(input: {
  backoffMs: number;
  hintedWaitMs?: number;
  nodeWaitedMs: number;
  runWaitedMs: number;
}): AutomationStudioRetryWait {
  const asked = Math.max(finite(input.backoffMs), finite(input.hintedWaitMs));
  const nodeRemaining = Math.max(0, AUTOMATION_STUDIO_MAX_NODE_RETRY_WAIT_MS - finite(input.nodeWaitedMs));
  const runRemaining = Math.max(0, AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS - finite(input.runWaitedMs));
  const waitMs = Math.min(asked, AUTOMATION_STUDIO_MAX_RETRY_WAIT_MS, nodeRemaining, runRemaining);
  return { waitMs, bounded: waitMs < asked };
}

/**
 * Whether the run may still absorb a fault by attempting again.
 *
 * False once the run has spent its whole waiting allowance. Attempts are what
 * cost the wall clock past that point, so continuing to offer them would leave
 * the per-run bound stated but not enforced.
 */
export function automationStudioRunMayStillAbsorb(runWaitedMs: number): boolean {
  return finite(runWaitedMs) < AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS;
}

function finite(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
