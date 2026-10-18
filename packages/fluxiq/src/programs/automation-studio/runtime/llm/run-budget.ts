import type { AutomationStudioLlmUsageSummary } from "./harness.ts";
import { AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS } from "./harness/task-kind.ts";
import { isAutomationStudioLoopStage } from "./stages/protocol.ts";
import { AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP } from "./flow-execution-limits/run-call-backstop.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD } from "./flow-execution-limits/run-cost-ceiling.ts";
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
  /** The run's cost total, held against every reservation. Absent means the run cost ceiling, `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD` ($0.10 by default). */
  maxEstimatedCostUsdPerRun?: number;
};

export type AutomationStudioLlmRunBudgetReservationInput = {
  runId: string;
  requestId: string;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  /** What this call reserves against the run's total before it knows what it spent. Absent means the whole ceiling. */
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
  costWindows: Map<symbol, { limitUsd: number; spentUsd: number; pending: Set<string> }>;
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
    if ((limits.maxEstimatedCostUsdPerRun ?? AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD) > 10) throw new Error("maxEstimatedCostUsdPerRun exceeds the server ceiling.");
    this.maxCallsPerRun = limits.maxCallsPerRun ?? AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP;
  }

  /** Restore only a complete settled receipt. A failed validation never changes the ledger. */
  restore(runId: string, receipt: unknown): boolean {
    if (!/^[a-z0-9_.:-]{1,200}$/i.test(runId) || this.states.has(runId) || !record(receipt)) return false;
    const state = restoredState(receipt);
    if (!state) return false;
    this.states.set(runId, state);
    return true;
  }

  /** The new portion of two settled canonical receipts; retained identities and charges are immutable. */
  static receiptChange(before: unknown, after: unknown): { calls: number; costUsd: number } | undefined {
    const current = restoredState(after), previous = before === undefined ? createRunState() : restoredState(before);
    if (!current || !previous || current.calls < previous.calls || current.estimatedCostUsd < previous.estimatedCostUsd
      || previous.records.some((item, index) => JSON.stringify(item) !== JSON.stringify(current.records[index]))) return undefined;
    return { calls: current.calls - previous.calls, costUsd: current.estimatedCostUsd - previous.estimatedCostUsd };
  }

  /** A temporary additional-cost grant, enforced by the same canonical reservations, including patch holds. */
  openCostWindow(runId: string, additionalCostUsd: number): { ok: true; close(): void } | { ok: false; diagnostic: AutomationStudioLlmRunBudgetDiagnostic } {
    if (!/^[a-z0-9_.:-]{1,200}$/i.test(runId) || !Number.isFinite(additionalCostUsd) || additionalCostUsd < 0) return {
      ok: false, diagnostic: { code: "llm_budget.invalid_reservation", message: "The additional-cost grant is invalid." }
    };
    const state = this.states.get(runId) ?? createRunState();
    const key = Symbol("cost-window");
    state.costWindows.set(key, { limitUsd: additionalCostUsd, spentUsd: 0, pending: new Set() });
    this.states.set(runId, state);
    return { ok: true, close: () => { state.costWindows.delete(key); } };
  }

  reserve(input: AutomationStudioLlmRunBudgetReservationInput): AutomationStudioLlmRunBudgetReservation {
    const requestedCost = input.maxEstimatedCostUsd ?? AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD;
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
    if (state.estimatedCostUsd + reservedCost + requestedCost > (this.limits.maxEstimatedCostUsdPerRun ?? AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD)) return { ok: false, diagnostic: { code: "llm_budget.run_cost_limit", message: "The per-run LLM estimated-cost budget cannot reserve this request." } };
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
          for (const window of state.costWindows.values()) if (window.pending.delete(input.requestId)) window.spentUsd += estimatedCostUsd;
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
          for (const window of state.costWindows.values()) window.pending.delete(input.requestId);
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
function runCall(value: unknown): value is AutomationStudioLlmRunCallRecord {
  if (!record(value) || !keys(value, ["sequence", "requestId", "taskKind", "stage", "allowance", "promptVersion", "provider", "model", "validation", "reported", "charged", "budgetBreach"])
    || !count(value.sequence) || typeof value.requestId !== "string" || !/^[a-z0-9_.:-]{1,200}$/i.test(value.requestId)
    || value.allowance !== "run" && value.allowance !== "exploration" || typeof value.budgetBreach !== "boolean"
    || value.taskKind !== null && !(typeof value.taskKind === "string" && Object.hasOwn(AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS, value.taskKind))
    || value.stage !== null && !isAutomationStudioLoopStage(value.stage)
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

function restoredState(receipt: unknown): RunState | undefined {
  if (!record(receipt)) return undefined;
  const snapshot = receipt.costAccounting;
  const calls = receipt.providerCalls;
  if (!record(snapshot) || !keys(snapshot, ["calls", "explorationCalls", "inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd", "budgetBreaches", "pendingCalls"])
    || !Array.isArray(calls) || receipt.providerCallsOmitted !== 0 || snapshot.pendingCalls !== 0) return undefined;
  for (const key of ["calls", "explorationCalls", "inputTokens", "outputTokens", "totalTokens", "budgetBreaches"]) if (!count(snapshot[key])) return undefined;
  if (!cost(snapshot.estimatedCostUsd) || snapshot.calls !== calls.length || calls.length > AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT) return undefined;
  const state = createRunState();
  for (const candidate of calls) {
    if (!runCall(candidate) || candidate.sequence !== state.calls + 1 || state.completedRequestIds.has(candidate.requestId!)) return undefined;
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
function canonicalCall(value: AutomationStudioLlmRunCallRecord): AutomationStudioLlmRunCallRecord {
  return {
    sequence: value.sequence, requestId: value.requestId, taskKind: value.taskKind, stage: value.stage, allowance: value.allowance,
    promptVersion: value.promptVersion, provider: value.provider, model: value.model,
    validation: value.validation ? { ok: value.validation.ok, issueCodes: [...value.validation.issueCodes] } : null,
    reported: { inputTokens: value.reported.inputTokens, outputTokens: value.reported.outputTokens, totalTokens: value.reported.totalTokens, estimatedCostUsd: value.reported.estimatedCostUsd },
    charged: { inputTokens: value.charged.inputTokens, outputTokens: value.charged.outputTokens, totalTokens: value.charged.totalTokens, estimatedCostUsd: value.charged.estimatedCostUsd, tokens: value.charged.tokens, cost: value.charged.cost },
    budgetBreach: value.budgetBreach
  };
}
