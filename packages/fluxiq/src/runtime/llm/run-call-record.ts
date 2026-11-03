import { modelRunCallRecord, modelBuildCallRecord, type ModelRunCallDescription, type ModelRunCallRecord, type ModelRunCallOutcome, type ModelRunCallChargeBasis, type ModelRunCallCharge, type ModelBuildCall } from "../agents/ledger/index.ts";
import { AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS, type AutomationStudioLlmTaskKind } from "./harness/task-kind.ts";
import { isAutomationStudioLoopStage, type AutomationStudioLoopStage } from "./stages/protocol.ts";

const isTaskKind = (value: unknown): value is AutomationStudioLlmTaskKind => typeof value === "string" && Object.hasOwn(AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS, value);
const receiptPolicy = { isTaskKind, isStage: isAutomationStudioLoopStage };

export type AutomationStudioLlmRunCallDescription = Omit<ModelRunCallDescription, "taskKind" | "stage"> & { taskKind: AutomationStudioLlmTaskKind; stage?: AutomationStudioLoopStage };
export type AutomationStudioLlmRunCallRecord = Omit<ModelRunCallRecord, "taskKind" | "stage"> & { taskKind: AutomationStudioLlmTaskKind | null; stage: AutomationStudioLoopStage | null };
export type AutomationStudioLlmRunCallOutcome = ModelRunCallOutcome;
export type AutomationStudioLlmRunCallChargeBasis = ModelRunCallChargeBasis;
export type AutomationStudioLlmRunCallCharge = ModelRunCallCharge;
export type AutomationStudioLlmBuildCall = Omit<ModelBuildCall, "description"> & { description?: Partial<AutomationStudioLlmRunCallDescription> | undefined };

export function automationStudioLlmRunCallRecord(input: Omit<Parameters<typeof modelRunCallRecord>[0], "description"> & { description?: AutomationStudioLlmRunCallDescription | undefined }): AutomationStudioLlmRunCallRecord {
  return specializedRecord(modelRunCallRecord(input, receiptPolicy));
}

export function automationStudioLlmBuildCallRecord(input: AutomationStudioLlmBuildCall): AutomationStudioLlmRunCallRecord {
  return specializedRecord(modelBuildCallRecord(input, receiptPolicy));
}

function specializedRecord(record: ModelRunCallRecord): AutomationStudioLlmRunCallRecord {
  const { taskKind, stage } = record;
  if (taskKind !== null && !isTaskKind(taskKind) || stage !== null && !isAutomationStudioLoopStage(stage)) throw new Error("Receipt escaped its Studio task vocabulary.");
  return { ...record, taskKind, stage };
}
