// Barrel for the automation-studio LLM harness. The export list is exactly
// what harness.ts exported before it was split, so runtime/llm/index.ts and
// every consumer of ../harness.ts see an unchanged surface. Modules not named
// here (json-bounds, provider-result, intervention, task-kind's task mappers)
// are harness internals and stay unexported.
export type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
export { AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS, type AutomationStudioLlmTaskKind } from "./task-kind.ts";
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
  packAutomationStudioLlmContext,
  type AutomationStudioLlmContextPacket,
  type AutomationStudioLlmRecentActionContext
} from "./context-packet.ts";
export {
  AUTOMATION_STUDIO_LLM_MAX_FAILURE_EVIDENCE_BYTES,
  sanitizeAutomationStudioLlmFailureEvidence,
  type AutomationStudioLlmFailureEvidenceCaptureInput
} from "./failure-evidence.ts";
export {
  isAutomationStudioRuntimeTargetOverrideTarget,
  type AutomationStudioLlmStructuredResponse,
  type AutomationStudioRuntimePatch,
  type AutomationStudioRuntimeTargetOverrideTarget
} from "./structured-response.ts";
export type {
  AutomationStudioLlmHarnessInput,
  AutomationStudioLlmTaskRequest,
  AutomationStudioLlmTaskResult
} from "./task-request.ts";
export { validateAutomationStudioLlmOutput } from "./output-validation.ts";
export { runAutomationStudioLlmHarness } from "./run.ts";
