import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "./contracts.ts";

type RegionTimerSource = NonNullable<AutomationStudioGraphExecutionOptions["startTimer"]>;

/**
 * Runs one region node bounded by the region's remaining time and the run's
 * signal. The timeout runs on `startTimer`, the run's
 * `AutomationStudioGraphExecutionOptions.startTimer`: the real `setTimeout`
 * when it is absent, exactly as before; an offline run's virtual timers when
 * its environment supplies them (P4, "Virtual clock").
 */
export async function executeWithRegionTimeout(run: (signal: AbortSignal) => Promise<AutomationStudioNodeAttemptTrace>, timeoutMs: number, parentSignal: AbortSignal | undefined, timeoutAttempt: () => AutomationStudioNodeAttemptTrace, commandRun?: AutomationStudioGraphExecutionOptions["commandRun"], startTimer?: AutomationStudioGraphExecutionOptions["startTimer"]): Promise<AutomationStudioNodeAttemptTrace> {
  const controller = new AbortController();
  const startRegionTimer: RegionTimerSource = startTimer ?? startRealRegionTimer;
  let timer: { cancel(): void } | undefined;
  let abortListener: (() => void) | undefined;
  try {
    const bounds = new Promise<AutomationStudioNodeAttemptTrace>((resolve, reject) => {
      const stop = (attempt: AutomationStudioNodeAttemptTrace) => { controller.abort(new Error("Region stopped.")); void Promise.resolve(commandRun?.stop("executor.region_stopped")).then(() => resolve(attempt), reject); };
      timer = startRegionTimer({ kind: "region_timeout" }, timeoutMs, () => stop(timeoutAttempt()));
      if (parentSignal) {
        abortListener = () => stop({ ...timeoutAttempt(), status: "cancelled", message: "Run cancelled." });
        parentSignal.addEventListener("abort", abortListener, { once: true });
        if (parentSignal.aborted) abortListener();
      }
    });
    const start = () => run(controller.signal); const running = commandRun ? commandRun.own(start) : start();
    return await Promise.race([running, bounds]);
  } finally {
    timer?.cancel();
    if (parentSignal && abortListener) parentSignal.removeEventListener("abort", abortListener);
  }
}

/** The region timeout on the real clock, as it always ran. */
function startRealRegionTimer(_wait: { readonly kind: "region_timeout" }, delayMs: number, fire: () => void): { cancel(): void } {
  const handle = setTimeout(fire, delayMs);
  return { cancel: () => clearTimeout(handle) };
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
