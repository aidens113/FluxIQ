import { modelRunCallRecord, type ModelRunCallDescription, type ModelRunCallRecord } from "./record.ts";
import type { ModelRunBudgetAllowance, ModelRunBudgetLimits, ModelRunBudgetReservationInput, ModelRunBudgetReservation, ModelRunBudgetDiagnostic } from "./types.ts";
import type { ModelReceiptPolicy, ModelRunLedgerPolicy } from "./policy.ts";
import type { ModelExecutionOptions } from "../../models/execution/index.ts";
import { ExecutionCallbackPolicies } from "../../execution-observation/policies/index.ts";
import { invokeOwnedExecutionCallbackSync } from "../../execution-observation/owned/index.ts";

type PendingReservation = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  allowance: ModelRunBudgetAllowance;
  call?: ModelRunCallDescription;
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
  records: ModelRunCallRecord[];
  /** Calls counted past the record limit, so the receipt can say it is short. */
  unrecordedCalls: number;
  costWindows: Map<symbol, { limitUsd: number; spentUsd: number; pending: Set<string> }>;
};

export class ModelRunBudgetLedger {
  private readonly states = new Map<string, RunState>();
  private readonly maxCallsPerRun: number;

  constructor(private readonly limits: ModelRunBudgetLimits, private readonly policy: ModelRunLedgerPolicy) {
    for (const [key, value] of Object.entries(limits)) {
      if (value === undefined) continue;
      if (key === "maxEstimatedCostUsdPerRun") {
        if (!Number.isFinite(value) || value <= 0) throw new Error(`${key} must be a positive finite number.`);
      } else if (!Number.isInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer.`);
    }
    if ((limits.maxEstimatedCostUsdPerRun ?? this.policy.defaultCostCeilingUsd) > 10) throw new Error("maxEstimatedCostUsdPerRun exceeds the server ceiling.");
    this.maxCallsPerRun = limits.maxCallsPerRun ?? this.policy.maxCallsPerRun;
    ExecutionCallbackPolicies.remember(this, nativeReserve, "pure");
  }

  /** Restore only a complete settled receipt. A failed validation never changes the ledger. */
  restore(runId: string, receipt: unknown): boolean {
    if (!/^[a-z0-9_.:-]{1,200}$/i.test(runId) || this.states.has(runId) || !record(receipt)) return false;
    const state = restoredState(receipt, this.policy);
    if (!state) return false;
    this.states.set(runId, state);
    return true;
  }

  /** The new portion of two settled canonical receipts; retained identities and charges are immutable. */
  static receiptChange(before: unknown, after: unknown, policy: ModelRunLedgerPolicy): { calls: number; costUsd: number } | undefined {
    const current = restoredState(after, policy), previous = before === undefined ? createRunState() : restoredState(before, policy);
    if (!current || !previous || current.calls < previous.calls || current.estimatedCostUsd < previous.estimatedCostUsd
      || previous.records.some((item, index) => JSON.stringify(item) !== JSON.stringify(current.records[index]))) return undefined;
    return { calls: current.calls - previous.calls, costUsd: current.estimatedCostUsd - previous.estimatedCostUsd };
  }

  /** A temporary additional-cost grant, enforced by the same canonical reservations, including patch holds. */
  openCostWindow(runId: string, additionalCostUsd: number): { ok: true; close(): void } | { ok: false; diagnostic: ModelRunBudgetDiagnostic } {
    if (!/^[a-z0-9_.:-]{1,200}$/i.test(runId) || !Number.isFinite(additionalCostUsd) || additionalCostUsd < 0) return {
      ok: false, diagnostic: { code: "llm_budget.invalid_reservation", message: "The additional-cost grant is invalid." }
    };
    const state = this.states.get(runId) ?? createRunState();
    const key = Symbol("cost-window");
    state.costWindows.set(key, { limitUsd: additionalCostUsd, spentUsd: 0, pending: new Set() });
    this.states.set(runId, state);
    return { ok: true, close: () => { state.costWindows.delete(key); } };
  }

  reserve(input: ModelRunBudgetReservationInput, execution?: ModelExecutionOptions): ModelRunBudgetReservation {
    const observation = execution?.observation;
    const requestedCost = input.maxEstimatedCostUsd ?? this.policy.defaultCostCeilingUsd;
    if (!/^[a-z0-9_.:-]{1,200}$/i.test(input.runId) || !/^[a-z0-9_.:-]{1,200}$/i.test(input.requestId)
      || !Number.isSafeInteger(input.estimatedInputTokens) || input.estimatedInputTokens < 0
      || !Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens <= 0 || !Number.isFinite(requestedCost) || requestedCost <= 0 || requestedCost > 10) {
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
    if (state.estimatedCostUsd + reservedCost + requestedCost > (this.limits.maxEstimatedCostUsdPerRun ?? this.policy.defaultCostCeilingUsd)) return { ok: false, diagnostic: { code: "llm_budget.run_cost_limit", message: "The per-run LLM estimated-cost budget cannot reserve this request." } };
    for (const window of state.costWindows.values()) {
      const held = [...window.pending].reduce((sum, requestId) => sum + (state.pending.get(requestId)?.estimatedCostUsd ?? 0), 0);
      if (window.spentUsd + held + requestedCost > window.limitUsd) return { ok: false, diagnostic: { code: "llm_budget.run_cost_limit", message: "The repair's additional-cost grant cannot reserve this request." } };
    }
    state.pending.set(input.requestId, {
      inputTokens: input.estimatedInputTokens,
      outputTokens: input.maxOutputTokens,
      totalTokens: requestedTotal,
      estimatedCostUsd: requestedCost,
      allowance: input.allowance ?? "run",
      ...(input.call ? { call: input.call } : {})
    });
    this.states.set(input.runId, state);
    for (const window of state.costWindows.values()) window.pending.add(input.requestId);
    let completed = false;
    const lease: Extract<ModelRunBudgetReservation, { ok: true }>["lease"] = {
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
        for (const window of state.costWindows.values()) if (window.pending.delete(input.requestId)) window.spentUsd += estimatedCostUsd;
        if (tokenBreach || costBreach) state.budgetBreaches += 1;
        if (state.records.length >= this.policy.recordLimit) {
          state.unrecordedCalls += 1;
          return;
        }
        const policy = this.policy;
        const isTaskKind = policy.isTaskKind;
        const isStage = policy.isStage;
        const receiptPolicy: ModelReceiptPolicy = observation ? {
          isTaskKind: (value: unknown): value is string => invokeOwnedExecutionCallbackSync(observation, { receiver: policy, callback: isTaskKind, args: [value] }),
          isStage: (value: unknown): value is string => invokeOwnedExecutionCallbackSync(observation, { receiver: policy, callback: isStage, args: [value] })
        } : policy;
        state.records.push(modelRunCallRecord({
          sequence: state.calls,
          requestId: input.requestId,
          allowance: reserved.allowance,
          description: reserved.call,
          outcome,
          usage,
          charged: { inputTokens, outputTokens, totalTokens, estimatedCostUsd, tokens: validUsage ? "reported" : "reserved", cost: validCost ? "reported" : "reserved" },
          budgetBreach: tokenBreach || costBreach
        }, receiptPolicy));
      },
      release: () => {
        if (completed) return;
        completed = true;
        state.pending.delete(input.requestId);
        for (const window of state.costWindows.values()) window.pending.delete(input.requestId);
      }
    };
    // Only this originally observed lease carries the context needed to cover its supplied policy callbacks.
    if (observation) ExecutionCallbackPolicies.remember(lease, lease.complete, "pure");
    ExecutionCallbackPolicies.remember(lease, lease.release, "pure");
    return { ok: true, lease };
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
  callRecords(runId: string): { calls: ModelRunCallRecord[]; omitted: number } {
    const state = this.states.get(runId) ?? createRunState();
    return { calls: state.records.map((record) => structuredClone(record)), omitted: state.unrecordedCalls };
  }
}

const nativeReserve = ModelRunBudgetLedger.prototype.reserve;


function createRunState(): RunState {
  return { calls: 0, explorationCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, budgetBreaches: 0, completedRequestIds: new Set(), pending: new Map(), records: [], unrecordedCalls: 0, costWindows: new Map() };
}

function nonNegativeInteger(value: number | undefined): number | undefined {
  return Number.isInteger(value) && value! >= 0 ? value : undefined;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function count(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function cost(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function identifier(value: unknown): boolean { return value === null || typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,199}$/u.test(value); }
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).every((key) => allowed.includes(key)); }

/** Validate every field before retaining a persisted canonical record, including charge provenance. */
function runCall(value: unknown, policy: ModelRunLedgerPolicy): value is ModelRunCallRecord {
  if (!record(value) || !keys(value, ["sequence", "requestId", "taskKind", "stage", "allowance", "promptVersion", "provider", "model", "validation", "reported", "charged", "budgetBreach"])
    || !count(value.sequence) || typeof value.requestId !== "string" || !/^[a-z0-9_.:-]{1,200}$/i.test(value.requestId)
    || value.allowance !== "run" && value.allowance !== "exploration" || typeof value.budgetBreach !== "boolean"
    || value.taskKind !== null && !policy.isTaskKind(value.taskKind)
    || value.stage !== null && !policy.isStage(value.stage)
    || ![value.promptVersion, value.provider, value.model].every(identifier)) return false;
  if (value.validation !== null && (!record(value.validation) || !keys(value.validation, ["ok", "issueCodes"]) || typeof value.validation.ok !== "boolean" || !Array.isArray(value.validation.issueCodes)
    || value.validation.issueCodes.length > 16 || !value.validation.issueCodes.every((item) => typeof item === "string" && /^[a-z][a-z0-9_.-]{0,127}$/u.test(item)))) return false;
  const charged = value.charged, reported = value.reported;
  if (!record(charged) || !record(reported) || !keys(charged, ["inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd", "tokens", "cost"])
    || !keys(reported, ["inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"]) || ![charged.inputTokens, charged.outputTokens, charged.totalTokens].every(count)
    || !cost(charged.estimatedCostUsd) || charged.totalTokens !== Number(charged.inputTokens) + Number(charged.outputTokens)
    || ![reported.inputTokens, reported.outputTokens, reported.totalTokens].every((item) => item === null || count(item))
    || reported.estimatedCostUsd !== null && !cost(reported.estimatedCostUsd)) return false;
  const reportedTokens = count(reported.inputTokens) && count(reported.outputTokens) && reported.totalTokens === reported.inputTokens + reported.outputTokens;
  if (charged.tokens !== (reportedTokens ? "reported" : "reserved") || charged.cost !== (cost(reported.estimatedCostUsd) ? "reported" : "reserved")) return false;
  return (!reportedTokens || ["inputTokens", "outputTokens", "totalTokens"].every((key) => charged[key] === reported[key]))
    && (charged.cost !== "reported" || charged.estimatedCostUsd === reported.estimatedCostUsd);
}

function restoredState(receipt: unknown, policy: ModelRunLedgerPolicy): RunState | undefined {
  if (!record(receipt)) return undefined;
  const snapshot = receipt.costAccounting;
  const calls = receipt.providerCalls;
  if (!record(snapshot) || !keys(snapshot, ["calls", "explorationCalls", "inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd", "budgetBreaches", "pendingCalls"])
    || !Array.isArray(calls) || receipt.providerCallsOmitted !== 0 || snapshot.pendingCalls !== 0) return undefined;
  for (const key of ["calls", "explorationCalls", "inputTokens", "outputTokens", "totalTokens", "budgetBreaches"]) if (!count(snapshot[key])) return undefined;
  if (!cost(snapshot.estimatedCostUsd) || snapshot.calls !== calls.length || calls.length > policy.recordLimit) return undefined;
  const state = createRunState();
  for (const candidate of calls) {
    if (!runCall(candidate, policy) || candidate.sequence !== state.calls + 1 || state.completedRequestIds.has(candidate.requestId!)) return undefined;
    state.completedRequestIds.add(candidate.requestId!);
    state.calls += 1;
    if (candidate.allowance === "exploration") state.explorationCalls += 1;
    state.inputTokens += candidate.charged.inputTokens;
    state.outputTokens += candidate.charged.outputTokens;
    state.totalTokens += candidate.charged.totalTokens;
    state.estimatedCostUsd += candidate.charged.estimatedCostUsd;
    if (candidate.budgetBreach) state.budgetBreaches += 1;
    state.records.push(canonicalCall(candidate));
  }
  for (const key of ["calls", "explorationCalls", "inputTokens", "outputTokens", "totalTokens", "budgetBreaches"] as const) if (state[key] !== snapshot[key]) return undefined;
  if (Math.abs(state.estimatedCostUsd - snapshot.estimatedCostUsd) > 1e-9) return undefined;
  // Keep the persisted total rather than introducing rounding drift on reentry.
  state.estimatedCostUsd = snapshot.estimatedCostUsd;
  return state;
}

/** Fixed field order is serialization detail, never receipt identity. */
function canonicalCall(value: ModelRunCallRecord): ModelRunCallRecord {
  return {
    sequence: value.sequence, requestId: value.requestId, taskKind: value.taskKind, stage: value.stage, allowance: value.allowance,
    promptVersion: value.promptVersion, provider: value.provider, model: value.model,
    validation: value.validation ? { ok: value.validation.ok, issueCodes: [...value.validation.issueCodes] } : null,
    reported: { inputTokens: value.reported.inputTokens, outputTokens: value.reported.outputTokens, totalTokens: value.reported.totalTokens, estimatedCostUsd: value.reported.estimatedCostUsd },
    charged: { inputTokens: value.charged.inputTokens, outputTokens: value.charged.outputTokens, totalTokens: value.charged.totalTokens, estimatedCostUsd: value.charged.estimatedCostUsd, tokens: value.charged.tokens, cost: value.charged.cost },
    budgetBreach: value.budgetBreach
  };
}
