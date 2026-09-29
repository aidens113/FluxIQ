// Barrel for the automation-studio LLM runtime. The export list mirrors what
// runtime/index.ts published for these modules before they moved here, so the
// program's public surface is unchanged. token-estimation.ts stays internal
// for the same reason: runtime/index.ts never exported it.
export * from "./harness.ts";
export * from "./provider-contract.ts";
export * from "./provider-factories.ts";
// The retry policy every provider call runs under, and the record of what it did
// (`provider-retry/`). Public because the record travels out of a run: a caller
// reading a failed build has to be able to name the type it is holding, and a
// host accounting for a run's wall clock has to be able to say how much of it
// went on waiting for a provider that was rate limiting us.
export * from "./provider-retry/index.ts";
// What a provider said when it refused a request, typed by the runtime-owned
// provider-refusal seam shared with Flow Bootstrap diagnostics.
// Public because the stored failure a build writes is meant to carry it: a
// reader outside runtime/llm has to be able to name the type it is holding.
export * from "../provider-refusal/index.ts";
export { estimateAutomationStudioDeepSeekInputTokens } from "./deepseek/index.ts";
// Which models Core will send to (`deepseek/models.ts`). The set and its
// default are public because every layer between Flow settings and the provider
// has to agree on them, and because one hardcoded string in each of those
// layers is what made DeepSeek's last rename a source edit in two repositories
// at once.
export {
  AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL,
  AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS,
  AUTOMATION_STUDIO_DEEPSEEK_MODELS,
  automationStudioDeepSeekModelRefusal,
  isAutomationStudioDeepSeekModel,
  resolveAutomationStudioDeepSeekModel,
  type AutomationStudioDeepSeekModel
} from "./deepseek/index.ts";
// What a call costs, beside the adapter that makes it: dated provider prices,
// and the cache split a reply reports (`deepseek/pricing.ts`).
export {
  AUTOMATION_STUDIO_DEEPSEEK_OFF_PEAK_RATE_MULTIPLIER,
  AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_HIT_INPUT_USD_PER_MILLION_TOKENS,
  AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_MISS_INPUT_USD_PER_MILLION_TOKENS,
  AUTOMATION_STUDIO_DEEPSEEK_PEAK_OUTPUT_USD_PER_MILLION_TOKENS,
  estimateAutomationStudioDeepSeekCostUsd
} from "./deepseek/index.ts";
// The chat window's model call and the key it is released
// (`deepseek/panel-command.ts`, `deepseek/panel-command-key.ts`). Public
// because the host binds them: the key comes from Secret Keys, which only the
// host holds.
export {
  automationStudioPanelCommandKeyFromSecretKeys,
  createAutomationStudioDeepSeekPanelCommandModel,
  type AutomationStudioDeepSeekPanelCommandOptions,
  type AutomationStudioPanelCommandKeyPorts
} from "./deepseek/index.ts";
export * from "./execution/index.ts";
// The grant's authorization table. Only the names `execution/grants.ts` used to
// publish itself are exported; the checks the grant runs stay internal.
export {
  automationStudioLlmExecutionGrantTaskKinds,
  type AutomationStudioLlmExecutionGrantPurpose,
  type AutomationStudioLlmExecutionGrantResolvePolicy
} from "./grant-capabilities.ts";
export * from "./failure-disposition.ts";
export * from "./evidence-loop.ts";
// What the model is told when the draft refuses one of its amendments, and the
// entry it arrives under. Published beside the loop for the same reason the
// decision and completion feedback are: a caller reading a run's evidence has
// to be able to name the entry.
export {
  AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID,
  automationStudioLlmEvidenceDraftAmendmentFeedback
} from "./draft-amendment-feedback.ts";
export * from "./harness-options/index.ts";
// The library as one thing a build may do: the verb that runs a node of the
// registry against the live target, and how such a step is written down.
export * from "./node-tools/index.ts";
export * from "./stages/index.ts";
export * from "./run-budget.ts";
export { automationStudioLlmBuildCallRecord } from "./run-call-record.ts";
export type {
  AutomationStudioLlmBuildCall,
  AutomationStudioLlmRunCallCharge,
  AutomationStudioLlmRunCallChargeBasis,
  AutomationStudioLlmRunCallDescription,
  AutomationStudioLlmRunCallOutcome,
  AutomationStudioLlmRunCallRecord
} from "./run-call-record.ts";
export * from "./runtime-session-grant.ts";
export * from "./resolver-contract.ts";
