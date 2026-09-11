import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "./contracts.ts";

export async function executeWithRegionTimeout(run: (signal: AbortSignal) => Promise<AutomationStudioNodeAttemptTrace>, timeoutMs: number, parentSignal: AbortSignal | undefined, timeoutAttempt: () => AutomationStudioNodeAttemptTrace): Promise<AutomationStudioNodeAttemptTrace> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  try {
    const bounds = new Promise<AutomationStudioNodeAttemptTrace>((resolve) => {
      timer = setTimeout(() => { controller.abort(new Error("Region timeout.")); resolve(timeoutAttempt()); }, timeoutMs);
      if (parentSignal) {
        abortListener = () => { controller.abort(parentSignal.reason); resolve({ ...timeoutAttempt(), status: "cancelled", message: "Run cancelled." }); };
        parentSignal.addEventListener("abort", abortListener, { once: true });
        if (parentSignal.aborted) abortListener();
      }
    });
    return await Promise.race([run(controller.signal), bounds]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (parentSignal && abortListener) parentSignal.removeEventListener("abort", abortListener);
  }
}

export function policyDecisionForAttempt(node: AutomationStudioFlowNode, attempt: AutomationStudioNodeAttemptTrace): NonNullable<AutomationStudioNodeAttemptTrace["policyDecision"]> {
  const outputId = typeof node.parameterValues?.outputId === "string" ? node.parameterValues.outputId : undefined;
  const confirmationInputId = typeof node.parameterValues?.confirmationInputId === "string" ? node.parameterValues.confirmationInputId : undefined;
  if (attempt.status === "waiting") return { outcome: "waiting", reason: attempt.message ?? "Policy action is waiting for confirmation or external state.", ...(outputId ? { outputId } : {}), ...(confirmationInputId ? { confirmationInputId } : {}) };
  if (attempt.status === "failed" || attempt.status === "cancelled") return { outcome: "rejected", reason: attempt.message ?? (confirmationInputId ? `Policy action did not receive confirmation from ${confirmationInputId}.` : "Policy action failed or was rejected."), ...(outputId ? { outputId } : {}), ...(confirmationInputId ? { confirmationInputId } : {}) };
  return { outcome: "selected", reason: outputId ? `Policy selected registered output ${outputId}.` : "Policy step completed successfully.", ...(outputId ? { outputId } : {}), ...(confirmationInputId ? { confirmationInputId } : {}) };
}

export function recordRegionTransition(edge: AutomationStudioFlowEdge, fromRegionId: string | undefined, options: AutomationStudioGraphExecutionOptions, transitions: NonNullable<AutomationStudioGraphExecutionTrace["regionTransitions"]>, at: number): void {
  if (!fromRegionId || !options.regionRuntime) return;
  const toRegionId = options.regionRuntime.nodeRegionIds[edge.targetNodeId];
  if (!toRegionId || toRegionId === fromRegionId) return;
  const handoff = options.regionRuntime.handoffs.find((candidate) => candidate.fromRegionId === fromRegionId && candidate.toRegionId === toRegionId && candidate.fromPortId === (edge.sourcePortId ?? "success") && candidate.toPortId === (edge.targetPortId ?? "in"));
  if (handoff) transitions.push({ handoffId: handoff.id, fromRegionId, toRegionId, edgeId: edge.id, at });
}
