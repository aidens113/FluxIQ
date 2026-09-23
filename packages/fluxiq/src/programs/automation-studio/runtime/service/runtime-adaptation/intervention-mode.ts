// The intervention mode a run asks for, normalized onto the three the runtime
// acts on.

export type AutomationStudioRuntimeInterventionMode = "fully_adaptive" | "manual_approval" | "no_llm_intervention" | "default" | "deterministic";

export function normalizeAutomationStudioRuntimeInterventionMode(mode: AutomationStudioRuntimeInterventionMode | undefined): "fully_adaptive" | "manual_approval" | "no_llm_intervention" {
  if (mode === "manual_approval") return mode;
  if (mode === "no_llm_intervention" || mode === "deterministic") return "no_llm_intervention";
  return "fully_adaptive";
}
