// One batched fact observation per lifecycle boundary (state-aware recovery
// plan, C4 "Resolution", C9).
//
// This module owns the call to the host's `factEvaluator`. Every condition a
// boundary needs -- each candidate's `when`, a completion check, a node's ready
// state, a checkpoint's `when` -- goes to the host in one call, and each answer
// comes back to the group that asked it. No call is made when nothing is to be
// asked. A condition Core cannot send is answered `unknown` here and never
// sent; a host that is missing, throws or answers a batch of the wrong length
// leaves every condition `unknown`. `unknown` is never `true`.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFactEvaluationContext, AutomationStudioHostRuntimeBoundary } from "../../host-runtime.ts";
import { type AutomationStudioFactCondition, type AutomationStudioFactConditionResult, parseAutomationStudioFactConditions } from "../lifecycle/index.ts";
import { automationStudioHostFactConditionResult } from "./host-fact-result.ts";

/** The conditions one reader of the observation asks, under a key it reads its answers back by. */
export type AutomationStudioFactObservationGroup = {
  key: string;
  conditions: readonly (AutomationStudioFactCondition | JsonValue)[];
};

/**
 * What one observation answered: each group's results by position, how many
 * host calls it made (0 or 1), and what went wrong with the host, when
 * something did.
 */
export type AutomationStudioFactObservation = {
  results: ReadonlyMap<string, readonly AutomationStudioFactConditionResult[]>;
  calls: 0 | 1;
  problem?: string;
};

/**
 * Observes every group's conditions in at most one host call.
 *
 * Not sent, and answered `unknown` with a `core:` reference that says why: a
 * condition that is not a well-formed fact condition (`core:malformed`), and
 * one whose target still holds an opaque `handle` rather than a durable target
 * (`core:unresolved_handle`). When nothing is left to send, no call is made.
 * When the run is cancelled, or the host has no `factEvaluator`, nothing is
 * sent either (`core:cancelled`, `core:no_fact_evaluation`). A host that throws
 * (`core:host_failed`) or answers a batch of another length
 * (`core:host_batch_length`) leaves every sent condition `unknown`.
 */
export async function observeAutomationStudioFacts(input: {
  hostRuntime: AutomationStudioHostRuntimeBoundary | undefined;
  groups: readonly AutomationStudioFactObservationGroup[];
  context: AutomationStudioFactEvaluationContext;
  now?: () => number;
}): Promise<AutomationStudioFactObservation> {
  const now = input.now ?? Date.now;
  const answers = input.groups.map((group) => group.conditions.map(() => undefined as AutomationStudioFactConditionResult | undefined));
  const sent: Array<{ group: number; index: number; condition: AutomationStudioFactCondition }> = [];
  input.groups.forEach((group, groupIndex) => {
    group.conditions.forEach((raw, index) => {
      const condition = sendable(raw);
      if (typeof condition === "string") answers[groupIndex]![index] = unknown(condition, now());
      else sent.push({ group: groupIndex, index, condition });
    });
  });
  const asked = sent.length ? await askHost(input, sent.map((entry) => entry.condition), now) : { calls: 0 as const, answers: [] };
  sent.forEach((entry, position) => {
    answers[entry.group]![entry.index] = "reference" in asked ? unknown(asked.reference, now()) : asked.answers[position];
  });
  const { calls } = asked;
  const problem = "problem" in asked ? asked.problem : undefined;
  const results = new Map<string, readonly AutomationStudioFactConditionResult[]>();
  input.groups.forEach((group, groupIndex) => {
    results.set(group.key, answers[groupIndex]!.map((answer) => answer ?? unknown("core:unanswered", now())));
  });
  return problem === undefined ? { results, calls } : { results, calls, problem };
}

/** The host's answers to the sent conditions, or the one reference every sent condition is answered `unknown` with. */
async function askHost(
  input: { hostRuntime: AutomationStudioHostRuntimeBoundary | undefined; context: AutomationStudioFactEvaluationContext },
  conditions: AutomationStudioFactCondition[],
  now: () => number
): Promise<{ calls: 0 | 1; answers: AutomationStudioFactConditionResult[] } | { calls: 0 | 1; reference: string; problem?: string }> {
  if (input.context.signal?.aborted) return { calls: 0, reference: "core:cancelled" };
  const evaluate = input.hostRuntime?.factEvaluator;
  if (!evaluate) return { calls: 0, reference: "core:no_fact_evaluation" };
  try {
    const returned: unknown = await evaluate.call(input.hostRuntime, conditions, input.context);
    if (!Array.isArray(returned) || returned.length !== conditions.length) {
      const answered = Array.isArray(returned) ? String(returned.length) : "no list of";
      return { calls: 1, reference: "core:host_batch_length", problem: `The host answered ${answered} fact results for ${conditions.length} conditions, so none of them is read.` };
    }
    const at = now();
    return { calls: 1, answers: returned.map((answer) => automationStudioHostFactConditionResult(answer, at)) };
  } catch (error) {
    return { calls: 1, reference: "core:host_failed", problem: `The host's fact evaluation failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** The condition as it may be sent, or the reference that says why it may not. */
function sendable(raw: AutomationStudioFactCondition | JsonValue): AutomationStudioFactCondition | string {
  const parsed = parseAutomationStudioFactConditions([raw as JsonValue], "condition");
  const condition = parsed.conditions[0];
  if (parsed.problems.length || !condition) return "core:malformed";
  if (condition.target && holdsHandle(condition.target)) return "core:unresolved_handle";
  return condition;
}

/** Whether a target still holds an opaque `handle` anywhere in it: a reference only one model turn can read. */
function holdsHandle(value: JsonValue): boolean {
  if (Array.isArray(value)) return value.some(holdsHandle);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, entry]) => key === "handle" || holdsHandle(entry as JsonValue));
}

function unknown(evidenceRef: string, capturedAt: number): AutomationStudioFactConditionResult {
  return { truth: "unknown", evidenceRef, capturedAt };
}
