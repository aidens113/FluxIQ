import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeSideEffectClass } from "./contracts.ts";

/**
 * How consequential this node is.
 *
 * Two readers ask the same question and must get the same answer: the host
 * context, which tells a host what it is about to be asked to do, and the
 * defensive policy, which decides whether an ambiguous fault may be attempted
 * again and whether a Flow may walk past this node's failure. It used to be
 * private to the dispatch path, which meant the retry decision had no way to ask
 * it -- and a retry that cannot tell a read from a payment is not a policy, it is
 * a hazard.
 */
export function automationStudioNodeSideEffectClass(node: AutomationStudioFlowNode): AutomationStudioNodeSideEffectClass {
  if (node.metadata?.destructive === true) return "destructive";
  if (node.metadata?.externalSideEffect === true) return "external";
  if (node.definitionId === "builtin.policy.action") return "external";
  if (node.definitionId.startsWith("builtin.database.")) return node.parameterValues?.dryRun === true ? "internal" : "external";
  return "none";
}

/**
 * Whether this node acts on the world, so repeating it is repeating an act.
 *
 * Deliberately narrower than `automationStudioNodeSideEffectClass`, and the two
 * answer different questions. That one tells a host what it may be asked to reach
 * for, and it is right to call every domain output `external`. This one decides
 * whether a fault that may already have landed is repeated, and calling every
 * domain output a mutation there would switch retries off for the whole of
 * web automation -- where the great majority of outputs read a page, move to
 * one, or wait for one, and none of those is an act to be careful of.
 *
 * So a node is taken to act on the world only where something says it does: the
 * node is marked destructive, marked as having an external side effect, declares
 * Core's neutral `mutate` effect, is gated behind a person's approval, or writes
 * to a store for real rather than as a dry run. A domain whose output spends money
 * or deletes something marks it; a domain that marks nothing gets retries, which
 * is the default the product wants and the repair loop is built around.
 */
export function automationStudioNodeMutates(node: AutomationStudioFlowNode): boolean {
  if (node.metadata?.destructive === true || node.metadata?.externalSideEffect === true) return true;
  if (node.metadata?.effect === "mutate" || node.parameterValues?.effect === "mutate") return true;
  if (node.parameterValues?.requiresApproval === true) return true;
  return node.definitionId.startsWith("builtin.database.") && node.parameterValues?.dryRun !== true;
}

/**
 * Whether repeating this node cannot act on anything, so a failure found *after*
 * the action ran may still be looked at again.
 *
 * A failure at `confirmation` or `verification` is evidence the action ran, which
 * is a stronger signal than a transport fault, so this asks for a positive reason
 * rather than the absence of a negative one. Three things count:
 *
 *  - the node touches nothing outside the run at all -- Core own check and wait
 *    nodes, where `automationStudioNodeSideEffectClass` is `none`. That is the
 *    rule the audit specified, and on its own it admits no domain output at all,
 *    because that class calls every one of them `external`;
 *  - the node states that it reads, or that repeating it is safe;
 *  - the node declares a record output. Its purpose is to carry rows out, reading
 *    them again cannot press anything, and each attempt captures under its own
 *    batch key. This is the case that matters live: a list read whose rows failed
 *    their own post-condition because the page had not finished drawing.
 *
 * What it deliberately does **not** admit is a domain output that says nothing
 * about itself. Core cannot tell a read from a press, and the downstream runtime
 * takes care never to press twice; re-dispatching the whole node on a guess would
 * undo that care. A domain whose verbs read should mark them
 * `metadata.effect: "observe"`, which is the one line that makes this exact for
 * every one of them.
 */
export function automationStudioNodeRepeatCannotAct(node: AutomationStudioFlowNode): boolean {
  if (automationStudioNodeSideEffectClass(node) === "none") return true;
  if (automationStudioNodeRepeatIsSafe(node)) return true;
  if (automationStudioNodeMutates(node)) return false;
  for (const declared of [node.parameterValues?.recordOutput, node.metadata?.recordOutput, node.metadata?.recordsPath]) {
    if (declared !== undefined && declared !== null) return true;
  }
  return false;
}

/**
 * Whether this node states that repeating it is harmless.
 *
 * A mutating node is not attempted again where the act may already have landed
 * unless it says so. Saying so is `metadata.idempotent: true`, which is the
 * author taking responsibility; an `idempotencyKey`, which is the node carrying
 * the means for the far side to recognise a repeat and refuse to act twice; or
 * Core's own neutral `effect: "observe"`, which is a node stating that it reads
 * rather than acts. A domain whose outputs are mostly reads should set that on
 * them: it is the one marker that lets a consequential-looking node keep its
 * retries without weakening the rule for the ones that really do act.
 */
export function automationStudioNodeRepeatIsSafe(node: AutomationStudioFlowNode): boolean {
  if (node.metadata?.idempotent === true) return true;
  if (node.metadata?.effect === "observe" || node.parameterValues?.effect === "observe") return true;
  const key = node.metadata?.idempotencyKey ?? node.parameterValues?.idempotencyKey;
  return typeof key === "string" && key.trim().length > 0;
}
