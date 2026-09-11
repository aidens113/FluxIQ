import type { AutomationStudioNodeAttemptTrace, AutomationStudioRecoveryBudget } from "./contracts.ts";

export function recoveryBudgetState(attempts: AutomationStudioNodeAttemptTrace[], currentAttemptIndex: number, nodeId: string, currentSubflowId: string | undefined): { failedAttemptsForAction: number; recoveryAttemptsForSubflow: number; reroutesForRun: number; llmAttemptsForRun: number } {
  const previous = attempts.filter((_, index) => index !== currentAttemptIndex);
  const previousRecovery = previous.filter((attempt) => attempt.recoveryDecision);
  return {
    failedAttemptsForAction: previous.filter((attempt) => attempt.nodeId === nodeId && attempt.status === "failed").length,
    recoveryAttemptsForSubflow: previousRecovery.filter((attempt) => !currentSubflowId || attempt.recoveryDecision?.lookup.currentSubflowId === currentSubflowId).length,
    reroutesForRun: previousRecovery.filter((attempt) => {
      const kind = attempt.recoveryDecision?.selected?.kind;
      return kind === "deterministic_path" || kind === "reroute";
    }).length,
    llmAttemptsForRun: previousRecovery.filter((attempt) => attempt.recoveryDecision?.selected?.kind === "llm_diagnosis").length
  };
}

export function recoveryBudgetExhaustion(budget: AutomationStudioRecoveryBudget, state: { failedAttemptsForAction: number; recoveryAttemptsForSubflow: number; reroutesForRun: number; llmAttemptsForRun: number }): { retry: boolean; recovery: boolean; reroute: boolean; llm: boolean; message?: string } {
  const retry = budget.maxRetriesPerAction !== undefined && state.failedAttemptsForAction >= budget.maxRetriesPerAction;
  const recovery = budget.maxRecoveryAttemptsPerSubflow !== undefined && state.recoveryAttemptsForSubflow >= budget.maxRecoveryAttemptsPerSubflow;
  const reroute = budget.maxReroutesPerRun !== undefined && state.reroutesForRun >= budget.maxReroutesPerRun;
  const llm = budget.maxAdaptationOrLlmAttemptsPerRun !== undefined && state.llmAttemptsForRun >= budget.maxAdaptationOrLlmAttemptsPerRun;
  const exhausted = [
    retry ? "max retries per action" : "",
    recovery ? "max recovery attempts per subflow" : "",
    reroute ? "max reroutes per run" : "",
    llm ? "max adaptation/LLM attempts per run" : ""
  ].filter(Boolean);
  return {
    retry,
    recovery,
    reroute,
    llm,
    ...(exhausted.length ? { message: `Recovery budget exhausted: ${exhausted.join(", ")}.` } : {})
  };
}
