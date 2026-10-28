// Before a stale step's source is re-run: whether the page is still where the
// source ran, and back there if it moved (t786, design D3 step 1).

import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../host-runtime.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { AutomationStudioSourcePlaceAnswer, AutomationStudioSourcePlaceRequest } from "./contracts.ts";

const ANSWERS: ReadonlySet<string> = new Set<AutomationStudioSourcePlaceAnswer>(["same_place", "returned", "unavailable"]);

/**
 * The host's answer. A host without `returnToSourcePlace` re-runs where it is
 * (`same_place`); one that throws, or answers something else, cannot get there
 * (`unavailable`), and the source is not re-run. `sourceAttempt` is the
 * source's latest attempt in this run, when it has one: only a place the run
 * itself recorded is gone back to.
 */
export async function automationStudioReacquireSourcePlace(input: {
  host: AutomationStudioHostRuntimeBoundary | undefined;
  node: AutomationStudioFlowNode;
  source: AutomationStudioFlowNode;
  attempts: readonly AutomationStudioNodeAttemptTrace[];
  signal?: AbortSignal | undefined;
}): Promise<AutomationStudioSourcePlaceAnswer> {
  const returnToSourcePlace = input.host?.returnToSourcePlace;
  if (!returnToSourcePlace) return "same_place";
  const ran = latestAttemptOf(input.attempts, input.source.id);
  const request: AutomationStudioSourcePlaceRequest = {
    node: input.node,
    source: input.source,
    ...(ran ? { sourceAttempt: { attemptId: ran.attemptId, outputs: ran.outputs, startedAt: ran.startedAt } } : {}),
    ...(input.signal ? { signal: input.signal } : {})
  };
  try {
    const answer: unknown = await returnToSourcePlace.call(input.host, request);
    return typeof answer === "string" && ANSWERS.has(answer) ? answer as AutomationStudioSourcePlaceAnswer : "unavailable";
  } catch {
    // A host that could not say where the page is cannot be trusted to have got there.
    return "unavailable";
  }
}

/** The source's latest attempt in the run, the one whose page a re-run should meet. */
function latestAttemptOf(attempts: readonly AutomationStudioNodeAttemptTrace[], nodeId: string): AutomationStudioNodeAttemptTrace | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (attempts[index]!.nodeId === nodeId) return attempts[index];
  }
  return undefined;
}
