import { ModelRunBudgetLedger, type ModelRunBudgetAllowance, type ModelRunBudgetLimits, type ModelRunBudgetReservationInput, type ModelRunBudgetDiagnostic, type ModelRunBudgetLease, type ModelRunBudgetReservation, type ModelRunCallRecord } from "../agents/ledger/index.ts";
import type { AutomationStudioLlmRunCallDescription, AutomationStudioLlmRunCallRecord } from "./run-call-record.ts";
import { AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS, type AutomationStudioLlmTaskKind } from "./harness/task-kind.ts";
import { isAutomationStudioLoopStage } from "./stages/protocol.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD } from "./flow-execution-limits/run-cost-ceiling.ts";

/**
 * How many calls a run's receipt itemizes, the rest counted as omitted. A bound on what is kept for reading, never on
 * what a run may make: no count of calls ends a run (t1056).
 */
export const AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT = 250;
export type AutomationStudioLlmRunBudgetAllowance = ModelRunBudgetAllowance;
export type AutomationStudioLlmRunBudgetLimits = ModelRunBudgetLimits;
export type AutomationStudioLlmRunBudgetDiagnostic = ModelRunBudgetDiagnostic;
export type AutomationStudioLlmRunBudgetLease = ModelRunBudgetLease;
export type AutomationStudioLlmRunBudgetReservation = ModelRunBudgetReservation;
export type AutomationStudioLlmRunBudgetReservationInput = Omit<ModelRunBudgetReservationInput, "call"> & { call?: AutomationStudioLlmRunCallDescription };

const isTaskKind = (value: unknown): value is AutomationStudioLlmTaskKind => typeof value === "string" && Object.hasOwn(AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS, value);
const receiptPolicy = { isTaskKind, isStage: isAutomationStudioLoopStage };
// **No count of calls ends a run (t1056; user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT
// RANDOMLY JUST RESETS EVERYTHING").** The generic ledger can refuse a call past a count (`llm_budget.run_call_limit`);
// Studio binds that count to nothing, so the run's dollar ceiling (`llm_budget.run_cost_limit`) is what ends a run, with
// its token ceilings beside it. It was the 250-call backstop, or the run's declared `maxCallsPerRun`, and it ended
// recoveries of cheap calls before their money did.
const policy = { ...receiptPolicy, defaultCostCeilingUsd: AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, maxCallsPerRun: Number.POSITIVE_INFINITY, recordLimit: AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT };

/** Studio binds its configured defaults and exact receipt vocabulary to the generic ledger. */
export class AutomationStudioLlmRunBudgetLedger extends ModelRunBudgetLedger {
  /** A declared `maxCallsPerRun` (a caller may still pass one, `adaptation/recovery/annotation/run-budget.ts`) is read by nothing (t1056). */
  constructor(limits: AutomationStudioLlmRunBudgetLimits) {
    const { maxCallsPerRun: _noCallCount, ...counted } = limits;
    super(counted, policy);
  }
  override reserve(input: AutomationStudioLlmRunBudgetReservationInput): AutomationStudioLlmRunBudgetReservation { return super.reserve(input); }
  override callRecords(runId: string): { calls: AutomationStudioLlmRunCallRecord[]; omitted: number } {
    const records = super.callRecords(runId);
    return { calls: records.calls.map(specializedRecord), omitted: records.omitted };
  }
  static override receiptChange(before: unknown, after: unknown): { calls: number; costUsd: number } | undefined {
    return ModelRunBudgetLedger.receiptChange(before, after, policy);
  }
}

function specializedRecord(record: ModelRunCallRecord): AutomationStudioLlmRunCallRecord {
  const { taskKind, stage } = record;
  if (taskKind !== null && !isTaskKind(taskKind) || stage !== null && !isAutomationStudioLoopStage(stage)) throw new Error("Receipt escaped its Studio task vocabulary.");
  return { ...record, taskKind, stage };
}
