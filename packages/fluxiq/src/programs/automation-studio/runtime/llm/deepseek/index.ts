// Everything Core knows about DeepSeek in one place: which models it will send
// to, what a call to one costs, and the adapter that makes the call.
//
// These were three sibling files under `runtime/llm/` sharing a `deepseek-`
// prefix, which is the structure audit's own signal that the prefix wanted to
// be a directory.
export * from "./models.ts";
export * from "./pricing.ts";
export {
  AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL,
  AUTOMATION_STUDIO_DEEPSEEK_MODEL,
  AUTOMATION_STUDIO_DEEPSEEK_ORIGIN,
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES,
  AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES,
  createAutomationStudioDeepSeekProvider,
  estimateAutomationStudioDeepSeekInputTokens,
  type AutomationStudioDeepSeekProviderOptions,
  type AutomationStudioLlmSecretReference
} from "./provider.ts";
