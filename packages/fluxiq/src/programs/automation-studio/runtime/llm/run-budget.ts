import type { AutomationStudioLlmUsageSummary } from "./harness.ts";
import {
  automationStudioLlmRunCallRecord,
  type AutomationStudioLlmRunCallDescription,
  type AutomationStudioLlmRunCallOutcome,
  type AutomationStudioLlmRunCallRecord
} from "./run-call-record.ts";

/**
 * Which kind of call a reservation is, for the run's accounting.
 *
 * `run` is the diagnosis, the patch, and anything else the loop's fixed stages
 * spend on this run. `exploration` is a decision inside a bounded exploration.
 *
 * This is a label, not a second allowance. It used to be both: the exploration
 * had its own call count because the run's ordinary count was two, the
 * diagnosis and the patch spent both, and an exploration that borrowed from it
 * was refused before it looked at anything. Once the run's call count stopped
 * being the thing that bounds a run, a separate count for exploring had nothing
 * left to protect, and two overlapping call ceilings is one more than a person
 * can reason about. What survives is the reason the split was worth having in
 * the first place: a run's receipt says how much of what it spent went on
 * looking around, rather than mixing it into the diagnosis and the patch.
 *
 * An undeclared reservation is a `run` reservation.
 */
export type AutomationStudioLlmRunBudgetAllowance = "run" | "exploration";

/**
 * The most provider calls one run may make when nobody says otherwise.
 *
 * A runaway backstop, not a working limit. What bounds a run is its estimated
 * cost ceiling, its token budget, the recovery's wall clock, and the
 * exploration's no-progress guard; a run that is still getting somewhere and
 * still has money, tokens and time is meant to keep going. This number exists
 * for the case none of those catch -- a loop that makes free, instant, ever
 * different calls forever -- and it is set where a working loop never meets it.
 *
 * It is deliberately not a per-mode constant. A host, a grant or a setting that
 * wants to allow fewer calls says so through `maxCallsPerRun`; nothing here
 * infers a count from what kind of run it is.
 */
export const AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP = 250;

/**
 * The most calls one run's receipt itemizes. Equal to the backstop, so a run
 * under the default backstop is itemized in full; a host that raises its own
 * call count past it gets the first this many, and the receipt says how many
 * it left out rather than ending short without saying so.
 */
export const AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT = AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP;

export type AutomationStudioLlmRunBudgetLimits = {
  /**
   * The runaway backstop on provider calls. Absent means
   * `AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP`. Every call counts against it,
   * whatever its label.
   */
  maxCallsPerRun?: number;
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
  /** What kind of call this is, for the receipt. Absent means an ordinary run call. */
  allowance?: AutomationStudioLlmRunBudgetAllowance;
  /**
   * What the call is, for its own line on the receipt. A hold that no call
   * ever spends has none; a call without one is still itemized, with its
   * description left `null`.
   */
  call?: AutomationStudioLlmRunCallDescription;
};

export type AutomationStudioLlmRunBudgetDiagnostic = {
  code: "llm_budget.run_call_limit" | "llm_budget.run_total_limit" | "llm_budget.run_output_limit" | "llm_budget.run_cost_limit" | "llm_budget.duplicate_request" | "llm_budget.invalid_reservation";
  message: string;
};

export type AutomationStudioLlmRunBudgetLease = {
  requestId: string;
  /**
   * Count the call and charge it. `usage` is the provider's own report, as it
   * gave it; the ledger decides which of its figures it can charge. `outcome`
   * is how the call ended, for the call's line on the receipt.
   */
  complete(usage?: AutomationStudioLlmUsageSummary, outcome?: AutomationStudioLlmRunCallOutcome): void;
  /**
   * Give the reservation back unspent: nothing is charged and no call is
   * counted. For a hold no call ever used -- the recovery sets one aside for its
   * patch while it explores, so the exploration cannot spend the patch's call,
   * tokens or money. A lease settles once, by whichever of the two comes first.
   */
  release(): void;
};

export type AutomationStudioLlmRunBudgetReservation =
  | { ok: true; lease: AutomationStudioLlmRunBudgetLease }
  | { ok: false; diagnostic: AutomationStudioLlmRunBudgetDiagnostic };

type PendingReservation = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  allowance: AutomationStudioLlmRunBudgetAllowance;
  call?: AutomationStudioLlmRunCallDescription;
};

type RunState = {
  /** Every completed call, whatever its label. The backstop counts this. */
  calls: number;
  /** The completed calls labelled `exploration`. A subset of `calls`. */
  explorationCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  budgetBreaches: number;
  completedRequestIds: Set<string>;
  pending: Map<string, PendingReservation>;
  /** One line per counted call, in the order counted, up to the record limit. */
  records: AutomationStudioLlmRunCallRecord[];
  /** Calls counted past the record limit, so the receipt can say it is short. */
  unrecordedCalls: number;
};

export class AutomationStudioLlmRunBudgetLedger {
  private readonly states = new Map<string, RunState>();
  private readonly maxCallsPerRun: number;

  constructor(private readonly limits: AutomationStudioLlmRunBudgetLimits) {
    for (const [key, value] of Object.entries(limits)) {
      if (value === undefined) continue;
      if (key === "maxEstimatedCostUsdPerRun") {
        if (!Number.isFinite(value) || value <= 0) throw new Error(`${key} must be a positive finite number.`);
      } else if (!Number.isInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer.`);
    }
    if ((limits.maxEstimatedCostUsdPerRun ?? 0.25) > 10) throw new Error("maxEstimatedCostUsdPerRun exceeds the server ceiling.");
    this.maxCallsPerRun = limits.maxCallsPerRun ?? AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP;
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
    // The backstop is checked first only because it is the cheapest. In a
    // working run it never fires; the three ceilings after it are the ones
    // that actually end a run.
    if (state.calls + state.pending.size >= this.maxCallsPerRun) {
      return { ok: false, diagnostic: { code: "llm_budget.run_call_limit", message: "The per-run LLM call backstop is exhausted: the run made more provider calls than a working loop should." } };
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
      totalTokens: requestedTotal,
      estimatedCostUsd: input.maxEstimatedCostUsd ?? 0.25,
      allowance: input.allowance ?? "run",
      ...(input.call ? { call: input.call } : {})
    });
    this.states.set(input.runId, state);
    let completed = false;
    return {
      ok: true,
      lease: {
        requestId: input.requestId,
        complete: (usage, outcome) => {
          if (completed) return;
          completed = true;
          const reserved = state.pending.get(input.requestId);
          if (!reserved) return;
          state.pending.delete(input.requestId);
          state.completedRequestIds.add(input.requestId);
          state.calls += 1;
          if (reserved.allowance === "exploration") state.explorationCalls += 1;
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
          const estimatedCostUsd = validCost ? suppliedCost : reserved.estimatedCostUsd;
          state.estimatedCostUsd += estimatedCostUsd;
          if (tokenBreach || costBreach) state.budgetBreaches += 1;
          if (state.records.length >= AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT) {
            state.unrecordedCalls += 1;
            return;
          }
          state.records.push(automationStudioLlmRunCallRecord({
            sequence: state.calls,
            requestId: input.requestId,
            allowance: reserved.allowance,
            description: reserved.call,
            outcome,
            usage,
            charged: { inputTokens, outputTokens, totalTokens, estimatedCostUsd, tokens: validUsage ? "reported" : "reserved", cost: validCost ? "reported" : "reserved" },
            budgetBreach: tokenBreach || costBreach
          }));
        },
        release: () => {
          if (completed) return;
          completed = true;
          state.pending.delete(input.requestId);
        }
      }
    };
  }

  /**
   * What the run has spent. `calls` is every completed call; `explorationCalls`
   * is how many of those were exploration decisions, so the fixed stages cost
   * `calls - explorationCalls`.
   */
  snapshot(runId: string): { calls: number; explorationCalls: number; inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number; budgetBreaches: number; pendingCalls: number } {
    const state = this.states.get(runId) ?? createRunState();
    return {
      calls: state.calls,
      explorationCalls: state.explorationCalls,
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      totalTokens: state.totalTokens,
      estimatedCostUsd: state.estimatedCostUsd,
      budgetBreaches: state.budgetBreaches,
      pendingCalls: state.pending.size
    };
  }

  /**
   * The run's receipt, one line per call, in the order the calls were counted.
   * Every call `snapshot` counts is here, up to the record limit; `omitted` is
   * how many it counted past that. A reservation released unspent is not a call
   * and has no line.
   */
  callRecords(runId: string): { calls: AutomationStudioLlmRunCallRecord[]; omitted: number } {
    const state = this.states.get(runId) ?? createRunState();
    return { calls: state.records.map((record) => structuredClone(record)), omitted: state.unrecordedCalls };
  }
}

function createRunState(): RunState {
  return { calls: 0, explorationCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, budgetBreaches: 0, completedRequestIds: new Set(), pending: new Map(), records: [], unrecordedCalls: 0 };
}

function nonNegativeInteger(value: number | undefined): number | undefined {
  return Number.isInteger(value) && value! >= 0 ? value : undefined;
}
