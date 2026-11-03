import { ModelRunBudgetLedger, type ModelRunBudgetAllowance, type ModelRunBudgetLimits, type ModelRunBudgetReservationInput, type ModelRunBudgetDiagnostic, type ModelRunBudgetLease, type ModelRunBudgetReservation, type ModelRunCallRecord } from "../ledger/index.ts";
import type { AutomationStudioLlmRunCallDescription, AutomationStudioLlmRunCallRecord } from "./run-call-record.ts";
import { AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS, type AutomationStudioLlmTaskKind } from "./harness/task-kind.ts";
import { isAutomationStudioLoopStage } from "./stages/protocol.ts";
import { AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP } from "./flow-execution-limits/run-call-backstop.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD } from "./flow-execution-limits/run-cost-ceiling.ts";

export const AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT = AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP;
export type AutomationStudioLlmRunBudgetAllowance = ModelRunBudgetAllowance;
export type AutomationStudioLlmRunBudgetLimits = ModelRunBudgetLimits;
export type AutomationStudioLlmRunBudgetDiagnostic = ModelRunBudgetDiagnostic;
export type AutomationStudioLlmRunBudgetLease = ModelRunBudgetLease;
export type AutomationStudioLlmRunBudgetReservation = ModelRunBudgetReservation;
export type AutomationStudioLlmRunBudgetReservationInput = Omit<ModelRunBudgetReservationInput, "call"> & { call?: AutomationStudioLlmRunCallDescription };

const isTaskKind = (value: unknown): value is AutomationStudioLlmTaskKind => typeof value === "string" && Object.hasOwn(AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS, value);
const receiptPolicy = { isTaskKind, isStage: isAutomationStudioLoopStage };
const policy = { ...receiptPolicy, defaultCostCeilingUsd: AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, maxCallsPerRun: AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP, recordLimit: AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT };

/** Studio binds its configured defaults and exact receipt vocabulary to the generic ledger. */
export class AutomationStudioLlmRunBudgetLedger extends ModelRunBudgetLedger {
  constructor(limits: AutomationStudioLlmRunBudgetLimits) { super(limits, policy); }
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
