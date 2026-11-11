import { automationStudioRunOverrides } from "../../../runtime/run-overrides/index.ts";

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
 *
 * It is sized for the default's three retries, and is the allowance of a run
 * that sets no other: a run's own is `automationStudioNodeRetryWaitAllowanceMs`.
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
 *
 * Sized, like the per-node bound, for the default's three retries; a run's own
 * is `automationStudioRunRetryWaitAllowanceMs`.
 */
export const AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS = 300_000;

/**
 * The retries both allowances above were sized for: the default policy's three
 * (`AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY`, `../retry-policy.ts`, which
 * imports this directory and so cannot be imported back; a test holds the two
 * equal).
 */
const ALLOWANCES_SIZED_FOR_RETRIES = 3;

/**
 * The most all the waits at one arrival at one node may add up to in the
 * current run (W3, t899): the run's own figure when its overrides frame gives
 * one, else the per-node bound above scaled with the attempts the run gives
 * every node, so that a run raising its retries is not cut short by an
 * allowance sized for three (every attempt past it would wait nothing and
 * hammer the site). A run with no frame gets the bound itself.
 */
export function automationStudioNodeRetryWaitAllowanceMs(): number {
  return runAllowanceMs(AUTOMATION_STUDIO_MAX_NODE_RETRY_WAIT_MS, "perNodeMs");
}

/**
 * The most all the waits in the current run may add up to (W3, t899): the
 * run's own figure, else the per-run bound above scaled with the run's
 * attempts, as `automationStudioNodeRetryWaitAllowanceMs` scales the per-node one.
 */
export function automationStudioRunRetryWaitAllowanceMs(): number {
  return runAllowanceMs(AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS, "perRunMs");
}

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
  const nodeRemaining = Math.max(0, automationStudioNodeRetryWaitAllowanceMs() - finite(input.nodeWaitedMs));
  const runRemaining = Math.max(0, automationStudioRunRetryWaitAllowanceMs() - finite(input.runWaitedMs));
  const waitMs = Math.min(asked, AUTOMATION_STUDIO_MAX_RETRY_WAIT_MS, nodeRemaining, runRemaining);
  return { waitMs, bounded: waitMs < asked };
}

/**
 * Whether the run may still absorb a fault by attempting again.
 *
 * False once the run has spent its whole waiting allowance
 * (`automationStudioRunRetryWaitAllowanceMs`). Attempts are what
 * cost the wall clock past that point, so continuing to offer them would leave
 * the per-run bound stated but not enforced.
 */
export function automationStudioRunMayStillAbsorb(runWaitedMs: number): boolean {
  return finite(runWaitedMs) < automationStudioRunRetryWaitAllowanceMs();
}

/** The frame's own allowance when it gives a usable one, else `sizedMs` scaled with the frame's attempts past the default's. */
function runAllowanceMs(sizedMs: number, field: "perNodeMs" | "perRunMs"): number {
  const frame = automationStudioRunOverrides();
  if (!frame) return sizedMs;
  const given = frame.retryWaits?.[field];
  if (typeof given === "number" && Number.isFinite(given) && given >= 0) return given;
  const attempts = frame.nodeAttempts;
  const retries = typeof attempts === "number" && Number.isFinite(attempts) ? Math.floor(attempts) - 1 : 0;
  return retries > ALLOWANCES_SIZED_FOR_RETRIES ? (sizedMs * retries) / ALLOWANCES_SIZED_FOR_RETRIES : sizedMs;
}

function finite(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
