import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioCreditedHintMs } from "./credited-hint.ts";
import { automationStudioBoundedRetryWaitMs } from "./retry-wait.ts";

/**
 * The wait before a retry, and what the run says about it.
 *
 * The wait is the longer of the backoff table and whatever the failing source
 * itself asked for, held to one wait, to this arrival's allowance, and to the
 * run's (`retry-wait.ts`). A hint counts from the refusal, so the time since
 * the failed attempt settled is credited against it (`credited-hint.ts`). It is
 * settled before the recovery is worded, so a retry the site asked to wait for
 * says how long FluxIQ actually waits (t378).
 *
 * `siteAsked` is what the recovery's words read: the site asked to slow down
 * when the failure carries its own wait. Core reads that hint, never a
 * domain's code for it. Nothing is planned when the ladder chose anything but
 * a retry (`retryBackoffMs` absent).
 */
export function automationStudioPlannedRetryWait(input: {
  /** The ladder's backoff when it chose to retry; absent for any other choice. */
  retryBackoffMs: number | undefined;
  /** The wait the failure itself asked for, from its assessment. */
  hintedWaitMs: number | undefined;
  /** When the failed attempt settled, and the run's clock now. */
  settledAt: number;
  now: number;
  nodeWaitedMs: number;
  runWaitedMs: number;
  node: AutomationStudioFlowNode;
}): {
  wait?: { waitMs: number; bounded: boolean };
  hint?: { askedMs: number; remainingMs: number; creditedMs: number };
  siteAsked: { slowedDown?: true; siteWaitMs?: number; presses?: boolean };
} {
  if (input.retryBackoffMs === undefined) return { siteAsked: {} };
  const hint = input.hintedWaitMs === undefined ? undefined : { askedMs: input.hintedWaitMs, ...automationStudioCreditedHintMs(input.hintedWaitMs, input.settledAt, input.now) };
  const wait = automationStudioBoundedRetryWaitMs({
    backoffMs: input.retryBackoffMs,
    ...(hint ? { hintedWaitMs: hint.remainingMs } : {}),
    nodeWaitedMs: input.nodeWaitedMs,
    runWaitedMs: input.runWaitedMs
  });
  const siteAsked = hint ? { slowedDown: true as const, siteWaitMs: wait.waitMs, presses: nodePresses(input.node) } : {};
  return { wait, ...(hint ? { hint } : {}), siteAsked };
}

/**
 * Whether a retry of this node presses something again, for the words alone: a
 * domain's action (dispatched through `builtin.policy.action`, or a domain's own
 * node) that does not state it only reads, waits or asserts
 * (`effect: "observe"`). Core's other nodes press nothing.
 */
function nodePresses(node: AutomationStudioFlowNode): boolean {
  if (node.definitionId !== "builtin.policy.action" && node.definitionId.startsWith("builtin.")) return false;
  return node.metadata?.effect !== "observe" && node.parameterValues?.effect !== "observe";
}
