import type { AutomationStudioChangeProposalPatch } from "../../../model/index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
import type { AutomationStudioLlmStructuredResponse, AutomationStudioRuntimePatch } from "./structured-response.ts";
import type { AutomationStudioLlmHarnessInput, AutomationStudioLlmTaskRequest } from "./task-request.ts";

export function validateAutomationStudioLlmOutput(
  response: AutomationStudioLlmStructuredResponse,
  expectedOutput: AutomationStudioLlmTaskRequest["expectedOutput"],
  flowBootstrap?: AutomationStudioLlmHarnessInput["flowBootstrap"]
): AutomationStudioLlmDiagnostic[] {
  const diagnostics: AutomationStudioLlmDiagnostic[] = [];
  if (containsExecutableCode(response)) diagnostics.push({ severity: "error", code: "llm_output.executable_code", message: "LLM output cannot include executable code, scripts, or function bodies." });
  if (response.kind !== expectedOutput && !(expectedOutput === "runtime_patch" && response.kind === "diagnosis")) {
    diagnostics.push({ severity: "error", code: "llm_output.kind_mismatch", message: `Expected ${expectedOutput} output but received ${response.kind}.`, path: "kind" });
  }
  if (!response.summary.trim()) diagnostics.push({ severity: "error", code: "llm_output.missing_summary", message: "LLM output must include a human-readable summary.", path: "summary" });
  if (response.kind === "flow_bootstrap") {
    if (!flowBootstrap) diagnostics.push({ severity: "error", code: "bootstrap.registry_context_missing", message: "Flow bootstrap validation requires a scope-aware node registry context.", path: "flowBootstrap" });
    else diagnostics.push(...validateAutomationStudioFlowBootstrapPlan({
      plan: response.plan,
      ...(flowBootstrap.registry ? { registry: flowBootstrap.registry } : {}),
      resolution: flowBootstrap.resolution
    }).issues);
  }
  if (response.kind === "evidence_tool_decision" && response.decision.kind === "tool_call" && !response.decision.toolId.trim()) {
    diagnostics.push({ severity: "error", code: "llm_output.invalid_evidence_tool", message: "Evidence tool decision requires a tool identifier.", path: "decision.toolId" });
  }
  if (response.kind === "runtime_patch") validateRuntimePatches(response.patches, diagnostics);
  if (response.kind === "change_proposal") validateChangeProposalPatches(response.patches, diagnostics);
  if (response.kind === "instruction_suggestion") {
    if (!response.instructions.length) diagnostics.push({ severity: "error", code: "llm_output.empty_instructions", message: "Instruction suggestion output must include at least one instruction.", path: "instructions" });
    for (const [index, instruction] of response.instructions.entries()) {
      if (!instruction.title.trim()) diagnostics.push({ severity: "error", code: "llm_output.instruction_missing_title", message: "Suggested instruction title cannot be empty.", path: `instructions.${index}.title` });
      if (!instruction.body.trim()) diagnostics.push({ severity: "error", code: "llm_output.instruction_missing_body", message: "Suggested instruction body cannot be empty.", path: `instructions.${index}.body` });
    }
  }
  return diagnostics;
}

function validateRuntimePatches(patches: AutomationStudioRuntimePatch[], diagnostics: AutomationStudioLlmDiagnostic[]): void {
  if (!patches.length) diagnostics.push({ severity: "error", code: "llm_output.empty_runtime_patches", message: "Runtime patch output must include at least one patch.", path: "patches" });
  for (const [index, patch] of patches.entries()) {
    if (!patch.reason.trim()) diagnostics.push({ severity: "error", code: "llm_output.patch_missing_reason", message: "Runtime patch must include a reason.", path: `patches.${index}.reason` });
    if ("targetNodeId" in patch && !patch.targetNodeId.trim()) diagnostics.push({ severity: "error", code: "llm_output.patch_missing_target", message: "Runtime patch targetNodeId cannot be empty.", path: `patches.${index}.targetNodeId` });
    if (patch.kind === "temporary_action_sequence" && !patch.actionDefinitionIds.length) diagnostics.push({ severity: "error", code: "llm_output.empty_action_sequence", message: "Temporary action sequence must include action definitions.", path: `patches.${index}.actionDefinitionIds` });
    if (patch.kind === "temporary_recovery_subflow_call" && !patch.subflowId.trim()) diagnostics.push({ severity: "error", code: "llm_output.patch_missing_subflow", message: "Recovery subflow call must include a subflowId.", path: `patches.${index}.subflowId` });
    if (patch.kind === "temporary_reroute" && (!patch.fromNodeId.trim() || !patch.toNodeId.trim())) diagnostics.push({ severity: "error", code: "llm_output.patch_missing_reroute", message: "Temporary reroute must include fromNodeId and toNodeId.", path: `patches.${index}` });
  }
}

function validateChangeProposalPatches(patches: AutomationStudioChangeProposalPatch[], diagnostics: AutomationStudioLlmDiagnostic[]): void {
  const allowed = new Set(["create_subflow", "edit_subflow", "edit_router", "edit_expectation", "edit_action_target", "edit_recovery", "promote_adaptation", "edit_instruction"]);
  if (!patches.length) diagnostics.push({ severity: "error", code: "llm_output.empty_change_patches", message: "Change proposal output must include at least one patch.", path: "patches" });
  for (const [index, patch] of patches.entries()) {
    if (!allowed.has(patch.kind)) diagnostics.push({ severity: "error", code: "llm_output.unsupported_patch_kind", message: `Unsupported change patch kind: ${patch.kind}.`, path: `patches.${index}.kind` });
    if (!patch.summary.trim()) diagnostics.push({ severity: "error", code: "llm_output.patch_missing_summary", message: "Change proposal patch summary cannot be empty.", path: `patches.${index}.summary` });
    if (patch.kind !== "create_subflow" && !patch.targetId?.trim()) diagnostics.push({ severity: "error", code: "llm_output.patch_missing_target", message: "Change proposal patch must include targetId unless it creates a subflow.", path: `patches.${index}.targetId` });
  }
}

function containsExecutableCode(value: unknown, seen = new Set<unknown>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsExecutableCode(item, seen));
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (["code", "script", "functionBody", "javascript", "typescript"].includes(key)) return true;
    if (containsExecutableCode(item, seen)) return true;
  }
  return false;
}
