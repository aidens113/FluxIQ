import type { AutomationStudioLlmUsageSummary } from "./llm-harness.ts";

export type AutomationStudioLlmRunBudgetLimits = {
  maxCallsPerRun: number;
  maxTotalTokensPerRun: number;
  maxOutputTokensPerRun: number;
  maxEstimatedCostUsdPerRun?: number;
};

export type AutomationStudioLlmRunBudgetReservationInput = {
  runId: string;
  requestId: string;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  maxEstimatedCostUsd?: number;
};

export type AutomationStudioLlmRunBudgetDiagnostic = {
  code: "llm_budget.run_call_limit" | "llm_budget.run_total_limit" | "llm_budget.run_output_limit" | "llm_budget.run_cost_limit" | "llm_budget.duplicate_request" | "llm_budget.invalid_reservation";
  message: string;
};

export type AutomationStudioLlmRunBudgetLease = {
  requestId: string;
  complete(usage?: AutomationStudioLlmUsageSummary): void;
};

export type AutomationStudioLlmRunBudgetReservation =
  | { ok: true; lease: AutomationStudioLlmRunBudgetLease }
  | { ok: false; diagnostic: AutomationStudioLlmRunBudgetDiagnostic };

type PendingReservation = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

type RunState = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  budgetBreaches: number;
  completedRequestIds: Set<string>;
  pending: Map<string, PendingReservation>;
};

export class AutomationStudioLlmRunBudgetLedger {
  private readonly states = new Map<string, RunState>();

  constructor(private readonly limits: AutomationStudioLlmRunBudgetLimits) {
    for (const [key, value] of Object.entries(limits)) {
      if (key === "maxEstimatedCostUsdPerRun") {
        if (!Number.isFinite(value) || value <= 0) throw new Error(`${key} must be a positive finite number.`);
      } else if (!Number.isInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer.`);
    }
    if ((limits.maxEstimatedCostUsdPerRun ?? 0.25) > 10) throw new Error("maxEstimatedCostUsdPerRun exceeds the server ceiling.");
  }

  reserve(input: AutomationStudioLlmRunBudgetReservationInput): AutomationStudioLlmRunBudgetReservation {
    if (!/^[a-z0-9_.:-]{1,200}$/i.test(input.runId) || !/^[a-z0-9_.:-]{1,200}$/i.test(input.requestId)
      || !Number.isSafeInteger(input.estimatedInputTokens) || input.estimatedInputTokens < 0
      || !Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens <= 0 || !Number.isFinite(input.maxEstimatedCostUsd ?? 0.25) || (input.maxEstimatedCostUsd ?? 0.25) <= 0 || (input.maxEstimatedCostUsd ?? 0.25) > 10) {
      return { ok: false, diagnostic: { code: "llm_budget.invalid_reservation", message: "LLM budget reservation fields are invalid." } };
    }
    const state = this.states.get(input.runId) ?? createRunState();
    if (state.completedRequestIds.has(input.requestId) || state.pending.has(input.requestId)) {
      return { ok: false, diagnostic: { code: "llm_budget.duplicate_request", message: "The LLM request ID has already been reserved for this run." } };
    }
    const pending = [...state.pending.values()];
    const reservedTotal = pending.reduce((sum, item) => sum + item.totalTokens, 0);
    const reservedOutput = pending.reduce((sum, item) => sum + item.outputTokens, 0);
    const reservedCost = pending.reduce((sum, item) => sum + item.estimatedCostUsd, 0);
    const requestedTotal = input.estimatedInputTokens + input.maxOutputTokens;
    if (state.calls + state.pending.size >= this.limits.maxCallsPerRun) {
      return { ok: false, diagnostic: { code: "llm_budget.run_call_limit", message: "The per-run LLM call limit is exhausted." } };
    }
    if (state.totalTokens + reservedTotal + requestedTotal > this.limits.maxTotalTokensPerRun) {
      return { ok: false, diagnostic: { code: "llm_budget.run_total_limit", message: "The per-run LLM total-token budget cannot reserve this request." } };
    }
    if (state.outputTokens + reservedOutput + input.maxOutputTokens > this.limits.maxOutputTokensPerRun) {
      return { ok: false, diagnostic: { code: "llm_budget.run_output_limit", message: "The per-run LLM output-token budget cannot reserve this request." } };
    }
    if (state.estimatedCostUsd + reservedCost + (input.maxEstimatedCostUsd ?? 0.25) > (this.limits.maxEstimatedCostUsdPerRun ?? 0.25)) return { ok: false, diagnostic: { code: "llm_budget.run_cost_limit", message: "The per-run LLM estimated-cost budget cannot reserve this request." } };
    state.pending.set(input.requestId, {
      inputTokens: input.estimatedInputTokens,
      outputTokens: input.maxOutputTokens,
      totalTokens: requestedTotal
      , estimatedCostUsd: input.maxEstimatedCostUsd ?? 0.25
    });
    this.states.set(input.runId, state);
    let completed = false;
    return {
      ok: true,
      lease: {
        requestId: input.requestId,
        complete: (usage) => {
          if (completed) return;
          completed = true;
          const reserved = state.pending.get(input.requestId);
          if (!reserved) return;
          state.pending.delete(input.requestId);
          state.completedRequestIds.add(input.requestId);
          state.calls += 1;
          const suppliedInput = nonNegativeInteger(usage?.inputTokens);
          const suppliedOutput = nonNegativeInteger(usage?.outputTokens);
          const suppliedTotal = nonNegativeInteger(usage?.totalTokens);
          const validUsage = suppliedInput !== undefined && suppliedOutput !== undefined && suppliedTotal === suppliedInput + suppliedOutput;
          const tokenBreach = validUsage && (suppliedInput > reserved.inputTokens || suppliedOutput > reserved.outputTokens || suppliedTotal > reserved.totalTokens);
          const inputTokens = validUsage ? suppliedInput : reserved.inputTokens;
          const outputTokens = validUsage ? suppliedOutput : reserved.outputTokens;
          const totalTokens = validUsage ? suppliedTotal : reserved.totalTokens;
          state.inputTokens += inputTokens;
          state.outputTokens += outputTokens;
          state.totalTokens += totalTokens;
          const suppliedCost = usage?.estimatedCostUsd;
          const validCost = typeof suppliedCost === "number" && Number.isFinite(suppliedCost) && suppliedCost >= 0;
          const costBreach = validCost && suppliedCost > reserved.estimatedCostUsd;
          state.estimatedCostUsd += validCost ? suppliedCost : reserved.estimatedCostUsd;
          if (tokenBreach || costBreach) state.budgetBreaches += 1;
        }
      }
    };
  }

  snapshot(runId: string): { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number; budgetBreaches: number; pendingCalls: number } {
    const state = this.states.get(runId) ?? createRunState();
    return {
      calls: state.calls,
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      totalTokens: state.totalTokens,
      estimatedCostUsd: state.estimatedCostUsd,
      budgetBreaches: state.budgetBreaches,
      pendingCalls: state.pending.size
    };
  }
}

function createRunState(): RunState {
  return { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, budgetBreaches: 0, completedRequestIds: new Set(), pending: new Map() };
}

function nonNegativeInteger(value: number | undefined): number | undefined {
  return Number.isInteger(value) && value! >= 0 ? value : undefined;
}
