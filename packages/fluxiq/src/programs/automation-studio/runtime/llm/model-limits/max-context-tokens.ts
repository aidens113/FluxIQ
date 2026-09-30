import { AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS } from "./model-limits.ts";

/** The largest context window of any model Core sends to: the most any one request may carry. */
export const AUTOMATION_STUDIO_DEEPSEEK_MAX_CONTEXT_TOKENS: number = Math.max(...Object.values(AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS).map((limits) => limits.contextTokens));
