import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../executor/contracts.ts";
import { automationStudioRuntimeRepeatTraceProvenance } from "./trace-provenance.ts";

/** Public read-only check: registration remains in a frame-private writer, never in trace JSON. */
export function automationStudioRuntimeRepeatStoppedTrace(trace: AutomationStudioGraphExecutionTrace, invocation: AutomationStudioGraphExecutionOptions["invocation"]): boolean {
  return automationStudioRuntimeRepeatTraceProvenance.stopped(trace, invocation);
}
