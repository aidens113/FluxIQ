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
  AUTOMATION_STUDIO_LLM_DEFAULT_REPLY_TOKENS,
  AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS,
  resolveAutomationStudioLlmTokenLimits,
  type AutomationStudioLlmTokenLimits
} from "./token-limits.ts";
export {
  resolveAutomationStudioLlmInstructions,
  type AutomationStudioInstructionResolution,
  type AutomationStudioInstructionResolutionInput,
  type AutomationStudioResolvedInstruction
} from "./instruction.ts";
// **This export precedes `context-packet.ts`, and the order is load-bearing.**
// `context-packet.ts` imports `runtime/flow-bootstrap/`, whose stored-failure
// parse imports this package's barrel, which imports the DeepSeek adapter, whose
// system prompt builds one of its instruction strings from
// `automationStudioExploredEvidenceLabel` while its own module body runs. That is
// a cycle back into this barrel, and a cycle only breaks when the value is read
// before the module that declares it has been evaluated -- exactly the failure
// `scripts/structure-audit/config.mjs` describes for `runtime/llm` and
// `runtime/recovery`. Declared here, the label exists by the time the cycle
// closes; declared after `context-packet.ts` it does not, and twenty-two test
// files fail to load with "automationStudioExploredEvidenceLabel is not a
// function". The durable fix is for the adapter to build that string inside a
// function, or for the parse to stop importing the barrel at module scope;
// neither module is this one's to change.
export {
  AUTOMATION_STUDIO_EXPLORED_EVIDENCE_MAX_ORDINAL,
  automationStudioExploredEvidenceHandle,
  automationStudioExploredEvidenceLabel,
  isAutomationStudioExploredEvidenceLabel
} from "./explored-evidence-label.ts";
export {
  AUTOMATION_STUDIO_LLM_MAX_RECENT_ACTIONS,
  isAutomationStudioLlmRecentActionContext,
  packAutomationStudioLlmContext,
  type AutomationStudioLlmActionPermissions,
  type AutomationStudioLlmContextPacket,
  type AutomationStudioLlmRecentActionContext
} from "./context-packet.ts";
export type { AutomationStudioLlmExploredEvidenceSlot } from "./explored-evidence.ts";
export {
  automationStudioEvidenceKey,
  sanitizeAutomationStudioLlmFailureEvidence,
  type AutomationStudioLlmFailureEvidenceCaptureInput
} from "./failure-evidence.ts";
export {
  AUTOMATION_STUDIO_LLM_CONVERSATION_MAX_BYTES,
  AUTOMATION_STUDIO_LLM_CONVERSATION_MAX_TURNS,
  type AutomationStudioLlmConversationContext,
  type AutomationStudioLlmConversationTurn
} from "./conversation.ts";
export { automationStudioLlmRequestEvidenceRefusal } from "./request-evidence-check.ts";
// The screen itself, for the one caller outside this directory that has to run
// it before a slot exists: the result verification bounds a run's stored rows
// into a summary, and a row that fails the screen must be dropped there rather
// than refused at the provider, where the only answer left is to send nothing.
export { automationStudioExecutableTargetKey, screenAutomationStudioLlmEvidence, type AutomationStudioLlmEvidenceScreenResult } from "./evidence-screen.ts";
export { AUTOMATION_STUDIO_WITHHELD_LOCATOR, automationStudioLocatorShapedText, automationStudioWithoutLocators } from "./locator-text.ts";
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
export { automationStudioRuntimePatchOutputSchema } from "./runtime-patch-schema.ts";
export { validateAutomationStudioLlmOutput } from "./output-validation.ts";
export { parseAutomationStudioLlmProviderResult } from "./provider-result.ts";
export { runAutomationStudioLlmHarness } from "./run.ts";
// Every guard that refuses to build a request, named, so a build that failed on
// one says which (`request-refusal.ts`).
export { AUTOMATION_STUDIO_LLM_REQUEST_REFUSAL_CODES, AutomationStudioLlmRequestRefusedError, type AutomationStudioLlmRequestRefusalCode } from "./request-refusal.ts";
export { AUTOMATION_STUDIO_LLM_DRAFT_WITHHELD_NOTE, automationStudioLlmDraftEntryWithoutDeniedKeys } from "./draft-screen.ts";
