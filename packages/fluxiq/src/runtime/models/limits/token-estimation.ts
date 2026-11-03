export const AUTOMATION_STUDIO_LLM_CONSERVATIVE_UTF8_BYTES_PER_TOKEN = 3;

export function estimateAutomationStudioLlmTokensFromUtf8Bytes(bytes: number): number {
  return Math.ceil(Math.max(0, Math.trunc(bytes)) / AUTOMATION_STUDIO_LLM_CONSERVATIVE_UTF8_BYTES_PER_TOKEN);
}

export function automationStudioLlmTokenBudgetBytes(tokens: number): number {
  return Math.max(0, Math.trunc(tokens)) * AUTOMATION_STUDIO_LLM_CONSERVATIVE_UTF8_BYTES_PER_TOKEN;
}
