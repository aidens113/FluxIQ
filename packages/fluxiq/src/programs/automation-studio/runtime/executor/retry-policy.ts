import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "./contracts.ts";
import { AUTOMATION_STUDIO_MAX_RETRY_WAIT_MS, automationStudioAttemptFaultIsAbsorbed } from "./defensive/index.ts";

/**
 * How many times one node may be attempted, and how long the run waits between
 * those attempts.
 *
 * `maxAttempts` counts the first attempt, so the default of four means one
 * attempt and three retries. `backoffMs` is read by attempt number: the wait
 * before attempt two is `backoffMs[0]`, before attempt three `backoffMs[1]`,
 * and a policy with fewer entries than attempts repeats its last one.
 */
export type AutomationStudioNodeRetryPolicy = {
  maxAttempts: number;
  backoffMs: readonly number[];
};

/**
 * Retries are on by default, and this is that default: the first attempt and
 * three retries, at 250 ms, then 1 s, then 2 s.
 *
 * **The user's rule (2026-10-07): three retries is always the default, for
 * every node, on every path** -- a saved Flow's playback, a build's candidate
 * trial, the build's own test runs, and every call it makes while exploring.
 * This constant is the one place that number is written. The graph executor
 * reads it below; a node run outside a graph run -- a domain running one node
 * against a live page while a build explores or tests its draft -- goes
 * through `automationStudioDispatchWithNodeRetries` (`./outside-graph/retries.ts`),
 * which reads it too; and the Flow settings' `maxRetriesPerAction` default is
 * derived from it (`model/flows.ts`).
 *
 * It is a floor. A Flow, a node, a Retry node or a run may ask for more
 * attempts, and the run's `maxRetriesPerAction` caps what they ask for, but
 * nothing lowers a node below this: what ends a node's retries early is the
 * per-fault assessment refusing to repeat an act whose effect is uncertain
 * (`defensive/assess.ts`), asked of every fault rather than declared ahead of
 * time. Settings stored before 2026-10-07 carry `maxRetriesPerAction: 2` from
 * the old default of three attempts; the floor keeps those Flows from running
 * one retry short.
 */
export const AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY: AutomationStudioNodeRetryPolicy = Object.freeze({
  maxAttempts: 4,
  backoffMs: Object.freeze([250, 1_000, 2_000])
});

/** The node that declares a retry policy for the branch its `success` port feeds. */
const RETRY_NODE_DEFINITION_ID = "builtin.timing.retry";

/** The most attempts any declaration may ask for, so a malformed document cannot pin a run to one node. */
const MAX_DECLARED_ATTEMPTS = 25;

/**
 * The policy this node runs under: its own declaration first, then a Retry node
 * guarding its branch, then the Flow's, then the run's, then Core's default;
 * never fewer attempts than that default, and capped by the run's
 * `maxRetriesPerAction` allowance only above it.
 *
 * The cap is why `maxRetriesPerAction` is now read here. It was a budget whose
 * only effect was to *remove* the Flow's own authored failed route once a node
 * had already failed in the run -- a cap wearing the name of an allowance. It
 * now means what it says: how many further attempts of the same action a run
 * may make, above the default every node gets.
 */
export function automationStudioNodeRetryPolicy(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  options: AutomationStudioGraphExecutionOptions
): AutomationStudioNodeRetryPolicy {
  const asked = declaredRetryPolicy(node.parameterValues?.retry)
    ?? declaredRetryPolicy(node.metadata?.retry)
    ?? branchRetryPolicy(flow, node)
    ?? declaredRetryPolicy(flow.metadata?.retry)
    ?? boundedPolicy(options.retryPolicy)
    ?? AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY;
  const floor = AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY.maxAttempts;
  const declared = asked.maxAttempts >= floor ? asked : { maxAttempts: floor, backoffMs: asked.backoffMs };
  const allowance = options.recoveryBudget?.maxRetriesPerAction;
  if (allowance === undefined || !Number.isFinite(allowance)) return declared;
  const capped = Math.max(floor, Math.floor(allowance) + 1);
  return capped >= declared.maxAttempts ? declared : { maxAttempts: capped, backoffMs: declared.backoffMs };
}

/**
 * The wait before `attemptNumber`, which is 1 for the first attempt and needs no
 * wait.
 *
 * Bounded by `AUTOMATION_STUDIO_MAX_RETRY_WAIT_MS`, because a document decides
 * this number and a document asking for an hour between attempts is asking for a
 * hang. The whole-node and whole-run bounds are applied where the wait is taken,
 * by `automationStudioBoundedRetryWaitMs`, which also honours a delay the failing
 * source asked for.
 */
export function automationStudioRetryBackoffMs(policy: AutomationStudioNodeRetryPolicy, attemptNumber: number): number {
  if (attemptNumber <= 1 || !policy.backoffMs.length) return 0;
  const index = Math.min(attemptNumber - 2, policy.backoffMs.length - 1);
  return Math.min(AUTOMATION_STUDIO_MAX_RETRY_WAIT_MS, Math.max(0, policy.backoffMs[index] ?? 0));
}

/**
 * Whether this node may be dispatched again.
 *
 * The question is answered by the default defensive policy, not here: see
 * `automationStudioAssessAttemptFault`. It reads a fault classified where it
 * happened, then the producer's own record, then -- for every node that reports a
 * failure without one -- what the node said, and it refuses a retry that would
 * repeat an act on the world.
 *
 * This used to demand a structured failure record and answer no without one,
 * which meant a node that threw, and every node that knows nothing about Core's
 * failure taxonomy, could not be retried at all. `node` is optional only so an
 * existing caller keeps working; pass it, or a mutating node loses its protection
 * against being acted twice.
 */
export function automationStudioAttemptIsRetryable(attempt: AutomationStudioNodeAttemptTrace, node?: AutomationStudioFlowNode): boolean {
  return automationStudioAttemptFaultIsAbsorbed(attempt, node);
}

/**
 * A Retry node declares the policy for the branch its `success` port feeds: the
 * target of that edge, and each node after it that only this branch reaches.
 *
 * Until now the node returned its own parameters as outputs and retried
 * nothing. The branch stops at the first node another edge also reaches,
 * because past that point the nodes are no longer this Retry node's to govern.
 */
function branchRetryPolicy(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode): AutomationStudioNodeRetryPolicy | undefined {
  for (const retryNode of flow.nodes) {
    if (retryNode.definitionId !== RETRY_NODE_DEFINITION_ID) continue;
    if (!retryNodeGovernsNode(flow, retryNode, node.id)) continue;
    const policy = retryNodeRetryPolicy(retryNode);
    if (policy) return policy;
  }
  return undefined;
}

function retryNodeGovernsNode(flow: AutomationStudioFlowDocument, retryNode: AutomationStudioFlowNode, nodeId: string): boolean {
  const start = flow.edges.find((edge) => edge.sourceNodeId === retryNode.id && (edge.sourcePortId ?? "success") === "success");
  if (!start) return false;
  const visited = new Set<string>([retryNode.id]);
  let current: string | undefined = start.targetNodeId;
  while (current && !visited.has(current)) {
    visited.add(current);
    // One way in keeps the branch unambiguous: a node another edge also reaches
    // is a join, and what the Retry node governs ends before it.
    if (flow.edges.filter((edge) => edge.targetNodeId === current).length !== 1) return false;
    if (current === nodeId) return true;
    const outgoing = flow.edges.filter((edge) => edge.sourceNodeId === current && (edge.sourcePortId ?? "success") === "success");
    if (outgoing.length !== 1) return false;
    current = outgoing[0]?.targetNodeId;
  }
  return false;
}

/** The Retry node's own parameters, read as a policy: `attempts`, `delayMs` and `backoff` become attempts and waits. */
function retryNodeRetryPolicy(retryNode: AutomationStudioFlowNode): AutomationStudioNodeRetryPolicy | undefined {
  const parameters = retryNode.parameterValues ?? {};
  const attempts = boundedAttempts(parameters.attempts);
  const delayMs = finiteNonNegative(parameters.delayMs) ?? 500;
  if (attempts === undefined) return undefined;
  const backoff = typeof parameters.backoff === "string" ? parameters.backoff : "fixed";
  const waits: number[] = [];
  for (let index = 0; index < Math.max(1, attempts - 1); index += 1) {
    waits.push(backoff === "exponential" ? delayMs * 2 ** index : backoff === "linear" ? delayMs * (index + 1) : delayMs);
  }
  return { maxAttempts: attempts, backoffMs: waits };
}

/** A declared policy, in either the `{maxAttempts, backoffMs}` shape or the Retry node's `{attempts, delayMs}` one. */
function declaredRetryPolicy(value: JsonValue | undefined): AutomationStudioNodeRetryPolicy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const declared = value as JsonObject;
  const attempts = boundedAttempts(declared.maxAttempts ?? declared.attempts);
  if (attempts === undefined) return undefined;
  const backoffMs = declaredBackoff(declared.backoffMs ?? declared.delayMs, attempts);
  return { maxAttempts: attempts, backoffMs: backoffMs ?? AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY.backoffMs };
}

function declaredBackoff(value: JsonValue | undefined, attempts: number): readonly number[] | undefined {
  if (Array.isArray(value)) {
    const waits = value.map((entry) => finiteNonNegative(entry)).filter((entry): entry is number => entry !== undefined);
    return waits.length ? waits : undefined;
  }
  const single = finiteNonNegative(value);
  if (single === undefined) return undefined;
  return Array.from({ length: Math.max(1, attempts - 1) }, () => single);
}

/** A policy the caller supplied directly, held to the same bounds as a declared one. */
function boundedPolicy(policy: AutomationStudioNodeRetryPolicy | undefined): AutomationStudioNodeRetryPolicy | undefined {
  if (!policy) return undefined;
  const attempts = boundedAttempts(policy.maxAttempts);
  if (attempts === undefined) return undefined;
  const waits = policy.backoffMs.filter((entry) => Number.isFinite(entry) && entry >= 0);
  return { maxAttempts: attempts, backoffMs: waits.length ? waits : AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY.backoffMs };
}

function boundedAttempts(value: JsonValue | undefined): number | undefined {
  const attempts = finiteNonNegative(value);
  if (attempts === undefined || attempts < 1) return undefined;
  return Math.min(MAX_DECLARED_ATTEMPTS, Math.floor(attempts));
}

function finiteNonNegative(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
