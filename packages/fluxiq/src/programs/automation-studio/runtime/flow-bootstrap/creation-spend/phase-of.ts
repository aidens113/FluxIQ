// Which phase of a Flow's spend one settled call belongs to (`./phases.ts`),
// read when the Flow's purse settles it (`runtime/service/creation-spend.ts`).
//
// A judge's call is `judge` wherever it is made: the purse knows it from the
// call itself. Every other call is placed by the step-log scope it was made in
// (`runtime/llm/step-log/scope.ts`): a re-author's part is `reauthor`, the
// instruction reading's phase is `read`, the creation's part is `build`, and a
// call made outside every build -- a run, its recovery, its result check -- is
// `runtime`. That scope is kept only while the step log is on
// (`FLUXIQ_LLM_STEP_LOG_DIR`), which every Lab run sets; with it off, a call
// that is not a judge's reads as `runtime`.
import type { AutomationStudioLlmStepLogContext } from "../../llm/index.ts";
import type { AutomationStudioFlowSpendPhase } from "./record.ts";

export function automationStudioFlowSpendPhaseOf(call: { judge: boolean }, scope: AutomationStudioLlmStepLogContext | undefined): AutomationStudioFlowSpendPhase {
  if (call.judge) return "judge";
  if (scope?.part === "reauthor") return "reauthor";
  if (scope?.phase === "read") return "read";
  if (scope?.part === "creation") return "build";
  return "runtime";
}
