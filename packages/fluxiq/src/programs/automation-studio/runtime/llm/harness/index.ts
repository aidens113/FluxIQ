// Barrel for the automation-studio LLM harness. The export list started as
// exactly what harness.ts exported before it was split, so runtime/llm/index.ts
// and every consumer of ../harness.ts saw an unchanged surface. Added since:
// the explored-packet label, which `runtime/recovery` writes and reads, and the
// pre-send evidence check a provider runs. Modules not named here (json-bounds,
// provider-result, intervention, task-kind's task mappers, explored-evidence)
// are harness internals and stay unexported.
export type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
export {
  AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS,
  automationStudioLlmTaskExpectsDiagnosis,
  type AutomationStudioLlmTaskKind
} from "./task-kind.ts";
export type {
  AutomationStudioLlmProvider,
  AutomationStudioLlmProviderMetadata,
  AutomationStudioLlmUsageSummary
} from "./provider.ts";
export {
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD,
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST,
  AUTOMATION_STUDIO_LLM_DEFAULT_MAX_ESTIMATED_COST_USD,
  resolveAutomationStudioLlmTokenLimits,
  type AutomationStudioLlmTokenLimits
} from "./token-limits.ts";
export {
  resolveAutomationStudioLlmInstructions,
  type AutomationStudioInstructionResolution,
  type AutomationStudioInstructionResolutionInput,
  type AutomationStudioResolvedInstruction
} from "./instruction.ts";
export {
  AUTOMATION_STUDIO_LLM_MAX_RECENT_ACTIONS,
  isAutomationStudioLlmRecentActionContext,
  packAutomationStudioLlmContext,
  type AutomationStudioLlmContextPacket,
  type AutomationStudioLlmRecentActionContext
} from "./context-packet.ts";
export {
  AUTOMATION_STUDIO_EXPLORED_EVIDENCE_MAX_ORDINAL,
  automationStudioExploredEvidenceHandle,
  automationStudioExploredEvidenceLabel,
  isAutomationStudioExploredEvidenceLabel
} from "./explored-evidence-label.ts";
export type { AutomationStudioLlmExploredEvidenceSlot } from "./explored-evidence.ts";
export {
  AUTOMATION_STUDIO_LLM_MAX_FAILURE_EVIDENCE_BYTES,
  sanitizeAutomationStudioLlmFailureEvidence,
  type AutomationStudioLlmFailureEvidenceCaptureInput
} from "./failure-evidence.ts";
export { automationStudioLlmRequestEvidenceRefusal } from "./request-evidence-check.ts";
// The screen itself, for the one caller outside this directory that has to run
// it before a slot exists: the result verification bounds a run's stored rows
// into a summary, and a row that fails the screen must be dropped there rather
// than refused at the provider, where the only answer left is to send nothing.
export { screenAutomationStudioLlmEvidence, type AutomationStudioLlmEvidenceScreenResult } from "./evidence-screen.ts";
export {
  AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH,
  AUTOMATION_STUDIO_NO_REPAIR_REASONS,
  AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH,
  AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN,
  AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES,
  AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_SERIALIZED_LENGTH,
  isAutomationStudioModelAuthoredTargetOverrideTarget,
  isAutomationStudioNoRepairReason,
  isAutomationStudioRuntimeTargetOverrideTarget,
  type AutomationStudioLlmDiagnosisFields,
  type AutomationStudioLlmStructuredResponse,
  type AutomationStudioNoRepairReason,
  type AutomationStudioRuntimePatch,
  type AutomationStudioRuntimeTargetOverrideTarget
} from "./structured-response.ts";
export type {
  AutomationStudioLlmHarnessInput,
  AutomationStudioLlmTaskRequest,
  AutomationStudioLlmTaskResult
} from "./task-request.ts";
export { validateAutomationStudioLlmOutput } from "./output-validation.ts";
export { parseAutomationStudioLlmProviderResult } from "./provider-result.ts";
export { runAutomationStudioLlmHarness } from "./run.ts";
