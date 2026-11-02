import { type RuntimeAdaptiveFailureClass, type RuntimeFailureRecord, type RuntimeFailureStage } from "@fluxiq/contracts/runtime";
export function outputDispatchFailure(category: RuntimeAdaptiveFailureClass, code: string, retryable: boolean, stage?: RuntimeFailureStage): RuntimeFailureRecord {
  return { category, code, retryable, ...(stage ? { stage } : {}) };
}
