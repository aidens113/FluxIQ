import type { AutomationStudioChangeProposalPatch } from "../../../model/index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
import {
  automationStudioHandlerThenDisposition,
  type AutomationStudioLlmStructuredResponse,
  type AutomationStudioRuntimeAddHandlerPatch,
  type AutomationStudioRuntimePatch,
  type AutomationStudioRuntimePatchHandlerSpec,
  type AutomationStudioRuntimeReplaceUnitPatch
} from "./structured-response.ts";
import type { AutomationStudioLlmHarnessInput, AutomationStudioLlmTaskRequest } from "./task-request.ts";
import { automationStudioDispositionAllowedAt } from "../../../nodes/control-flow/index.ts";

export function validateAutomationStudioLlmOutput(
  response: AutomationStudioLlmStructuredResponse,
  expectedOutput: AutomationStudioLlmTaskRequest["expectedOutput"],
  flowBootstrap?: AutomationStudioLlmHarnessInput["flowBootstrap"]
): AutomationStudioLlmDiagnostic[] {
  const diagnostics: AutomationStudioLlmDiagnostic[] = [];
  if (containsExecutableCode(response)) diagnostics.push({ severity: "error", code: "llm_output.executable_code", message: "LLM output cannot include executable code, scripts, or function bodies." });
  // A patch call may come back as a diagnosis, and it may come back declined:
  // "there is no repair" is an answer to "repair this", and for some failures
  // it is the only true one.
  if (response.kind !== expectedOutput && !(expectedOutput === "runtime_patch" && (response.kind === "diagnosis" || response.kind === "no_repair"))) {
    diagnostics.push({ severity: "error", code: "llm_output.kind_mismatch", message: `Expected ${expectedOutput} output but received ${response.kind}.`, path: "kind" });
  }
  if (!response.summary.trim()) diagnostics.push({ severity: "error", code: "llm_output.missing_summary", message: "LLM output must include a human-readable summary.", path: "summary" });
  if (response.kind === "flow_bootstrap") {
    if (!flowBootstrap) diagnostics.push({ severity: "error", code: "bootstrap.registry_context_missing", message: "Flow bootstrap validation requires a scope-aware node registry context.", path: "flowBootstrap" });
    else diagnostics.push(...validateAutomationStudioFlowBootstrapPlan({
      plan: response.plan,
      ...(flowBootstrap.registry ? { registry: flowBootstrap.registry } : {}),
      resolution: flowBootstrap.resolution,
      ...(flowBootstrap.size ? { size: flowBootstrap.size } : {})
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
    if (patch.kind === "temporary_action_sequence" && (!patch.steps.length || patch.steps.some((step) => !step.definitionId.trim()))) diagnostics.push({ severity: "error", code: "llm_output.empty_action_sequence", message: "Temporary action sequence must include steps, each naming the definition it runs.", path: `patches.${index}.steps` });
    if (patch.kind === "temporary_recovery_subflow_call" && !patch.subflowId.trim()) diagnostics.push({ severity: "error", code: "llm_output.patch_missing_subflow", message: "Recovery subflow call must include a subflowId.", path: `patches.${index}.subflowId` });
    if (patch.kind === "temporary_reroute" && (!patch.fromNodeId.trim() || !patch.toNodeId.trim())) diagnostics.push({ severity: "error", code: "llm_output.patch_missing_reroute", message: "Temporary reroute must include fromNodeId and toNodeId.", path: `patches.${index}` });
    if (patch.kind === "add_handler" || patch.kind === "replace_unit") {
      for (const issue of unitRepairPatchIssues(patch)) diagnostics.push({ severity: "error", code: issue.code, message: issue.message, path: `patches.${index}.${issue.path}` });
    }
  }
}

// What an `add_handler` or `replace_unit` patch must say given what it is for,
// the half of the check that depends on the handler's event or the unit's
// kind. The rules are C4's and C5's (state-aware recovery plan), stated over a
// repair so a model's answer is refused before anything is overlaid; the Flow
// validator applies them again to the graph the overlay builds.

/** One refusal, in the harness's diagnostic terms, with the path below the patch it names. */
type UnitRepairIssue = { code: string; message: string; path: string };

/**
 * What a unit-repair patch must say and does not. A `before` or `retry`
 * handler names the situation it is for and the evidence that it worked, a
 * `then` its event may take, and a route its checkpoint; a node or a part is
 * replaced by steps, and a handler by a handler.
 */
function unitRepairPatchIssues(patch: AutomationStudioRuntimeAddHandlerPatch | AutomationStudioRuntimeReplaceUnitPatch): UnitRepairIssue[] {
  if (patch.kind === "add_handler") return handlerIssues(patch, "");
  if (patch.unit.kind === "handler") {
    return patch.handler ? handlerIssues(patch.handler, "handler.") : [{ code: "llm_output.replace_unit_missing_handler", message: "A handler is replaced by a handler.", path: "handler" }];
  }
  return stepIssues(patch.steps, "steps", "llm_output.replace_unit_missing_steps", `A ${patch.unit.kind} is replaced by steps, each naming the definition it runs.`);
}

function handlerIssues(handler: AutomationStudioRuntimePatchHandlerSpec, prefix: string): UnitRepairIssue[] {
  const issues: UnitRepairIssue[] = [];
  const guarded = handler.event === "before" || handler.event === "retry";
  if (guarded && !handler.when?.length) {
    issues.push({ code: "llm_output.handler_missing_when", message: `A handler that runs ${handler.event === "before" ? "before an attempt" : "before a retry"} must say in when which situation it is for.`, path: `${prefix}when` });
  }
  if (guarded && !handler.completionCheck?.length) {
    issues.push({ code: "llm_output.handler_missing_completion_check", message: `A handler that runs ${handler.event === "before" ? "before an attempt" : "before a retry"} must say what proves it worked (completionCheck).`, path: `${prefix}completionCheck` });
  }
  if (handler.scope?.kind === "nodes" && !handler.scope.nodeIds.some((id) => id.trim())) {
    issues.push({ code: "llm_output.handler_empty_scope", message: "A handler scoped to nodes must name at least one node.", path: `${prefix}scope.nodeIds` });
  }
  if (handler.then) {
    const disposition = automationStudioHandlerThenDisposition(handler.then);
    if (!automationStudioDispositionAllowedAt(handler.event, disposition)) {
      issues.push({ code: "llm_output.handler_then_not_allowed", message: `A ${handler.event} handler may not end with ${handler.then.kind}: ${disposition === "resume" ? "no success continues a failure" : "only a failure can be resolved"}.`, path: `${prefix}then` });
    }
    if (handler.then.kind === "route" && !handler.then.checkpointId.trim()) {
      issues.push({ code: "llm_output.handler_route_missing_checkpoint", message: "A handler that routes must name the checkpoint it goes to.", path: `${prefix}then.checkpointId` });
    }
  }
  issues.push(...stepIssues(handler.steps, `${prefix}steps`, "llm_output.handler_missing_steps", "A handler's body must be steps, each naming the definition it runs."));
  return issues;
}

function stepIssues(steps: readonly { definitionId: string }[] | undefined, path: string, code: string, message: string): UnitRepairIssue[] {
  return !steps?.length || steps.some((step) => !step.definitionId.trim()) ? [{ code, message, path }] : [];
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
