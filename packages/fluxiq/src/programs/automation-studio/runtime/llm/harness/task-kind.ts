import type { AutomationStudioFlowIntervention } from "../../../model/index.ts";
import type { AutomationStudioLlmTaskRequest } from "./task-request.ts";

export type AutomationStudioLlmTaskKind =
  | "flow_bootstrap"
  | "evidence_tool_decision"
  | "runtime_diagnosis"
  | "runtime_patch"
  | "router_patch"
  | "subflow_patch"
  | "expectation_action_target_patch"
  | "instruction_suggestion"
  | "change_proposal_generation"
  | "diagnosis_only_report";

export const AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS: Record<AutomationStudioLlmTaskKind, string> = {
  flow_bootstrap: "automation-studio.flow-bootstrap.v1",
  evidence_tool_decision: "automation-studio.evidence-tool-decision.v1",
  runtime_diagnosis: "automation-studio.runtime-diagnosis.v1",
  runtime_patch: "automation-studio.runtime-patch.v1",
  router_patch: "automation-studio.router-patch.v1",
  subflow_patch: "automation-studio.subflow-patch.v1",
  expectation_action_target_patch: "automation-studio.expectation-action-target-patch.v1",
  instruction_suggestion: "automation-studio.instruction-suggestion.v1",
  change_proposal_generation: "automation-studio.change-proposal-generation.v1",
  diagnosis_only_report: "automation-studio.diagnosis-only-report.v1"
};

export function expectedOutputForTask(taskKind: AutomationStudioLlmTaskKind): AutomationStudioLlmTaskRequest["expectedOutput"] {
  if (taskKind === "flow_bootstrap") return "flow_bootstrap";
  if (taskKind === "evidence_tool_decision") return "evidence_tool_decision";
  if (taskKind === "runtime_patch") return "runtime_patch";
  if (taskKind === "instruction_suggestion") return "instruction_suggestion";
  if (taskKind === "change_proposal_generation" || taskKind === "router_patch" || taskKind === "subflow_patch" || taskKind === "expectation_action_target_patch") return "change_proposal";
  return "diagnosis";
}

export function kindForLlmTask(taskKind: AutomationStudioLlmTaskKind): AutomationStudioFlowIntervention["kind"] {
  if (taskKind === "router_patch") return "router_patch";
  if (taskKind === "subflow_patch") return "subflow_patch";
  if (taskKind === "expectation_action_target_patch") return "expectation_patch";
  if (taskKind === "instruction_suggestion") return "instruction_suggestion";
  if (taskKind === "change_proposal_generation") return "change_proposal";
  if (taskKind === "runtime_patch") return "runtime_patch";
  return "diagnosis";
}
