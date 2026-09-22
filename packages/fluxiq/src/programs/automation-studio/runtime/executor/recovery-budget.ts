import type { AutomationStudioNodeAttemptTrace, AutomationStudioRecoveryBudget } from "./contracts.ts";

export function recoveryBudgetState(attempts: AutomationStudioNodeAttemptTrace[], currentAttemptIndex: number, nodeId: string, currentSubflowId: string | undefined): { failedAttemptsForAction: number; recoveryAttemptsForSubflow: number; reroutesForRun: number; llmAttemptsForRun: number } {
  const previous = attempts.filter((_, index) => index !== currentAttemptIndex);
  const previousRecovery = previous.filter((attempt) => attempt.recoveryDecision);
  return {
    // An attempt the ladder retried is not a fresh arrival at the action. The
    // retry loop bounds itself through `maxRetriesPerAction`, and counting its
    // own attempts here as well would spend the reroute and subflow budgets on
    // one node retrying itself.
    failedAttemptsForAction: previous.filter((attempt) => attempt.nodeId === nodeId && attempt.status === "failed" && !attempt.retry).length,
    recoveryAttemptsForSubflow: previousRecovery.filter((attempt) => !currentSubflowId || attempt.recoveryDecision?.lookup.currentSubflowId === currentSubflowId).length,
    reroutesForRun: previousRecovery.filter((attempt) => {
      const kind = attempt.recoveryDecision?.selected?.kind;
      return kind === "deterministic_path" || kind === "reroute";
    }).length,
    llmAttemptsForRun: previousRecovery.filter((attempt) => attempt.recoveryDecision?.selected?.kind === "llm_diagnosis").length
  };
}

/**
 * Which budgets this failure has already spent.
 *
 * `maxRetriesPerAction` is not among them any more. It used to be read here,
 * where its only effect was to withdraw the Flow's **own authored failed
 * route** as soon as a node had failed once before -- a cap wearing the name of
 * an allowance, and one that removed a Flow's deliberate error handling rather
 * than bounding anything the runtime did. It is now what it says it is: the
 * attempt allowance the per-node retry loop runs under
 * (`automationStudioNodeRetryPolicy`).
 */
export function recoveryBudgetExhaustion(budget: AutomationStudioRecoveryBudget, state: { failedAttemptsForAction: number; recoveryAttemptsForSubflow: number; reroutesForRun: number; llmAttemptsForRun: number }): { recovery: boolean; reroute: boolean; llm: boolean; message?: string } {
  const recovery = budget.maxRecoveryAttemptsPerSubflow !== undefined && state.recoveryAttemptsForSubflow >= budget.maxRecoveryAttemptsPerSubflow;
  const reroute = budget.maxReroutesPerRun !== undefined && state.reroutesForRun >= budget.maxReroutesPerRun;
  const llm = budget.maxAdaptationOrLlmAttemptsPerRun !== undefined && state.llmAttemptsForRun >= budget.maxAdaptationOrLlmAttemptsPerRun;
  const exhausted = [
    recovery ? "max recovery attempts per subflow" : "",
    reroute ? "max reroutes per run" : "",
    llm ? "max adaptation/LLM attempts per run" : ""
  ].filter(Boolean);
  return {
    recovery,
    reroute,
    llm,
    ...(exhausted.length ? { message: `Recovery budget exhausted: ${exhausted.join(", ")}.` } : {})
  };
}
