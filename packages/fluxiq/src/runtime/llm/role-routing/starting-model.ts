import { AUTOMATION_STUDIO_LLM_DEFAULT_MODEL, AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED } from "../../models/catalog/index.ts";

/**
 * The model a task starts on when it names none (user, 2026-11-20: "its just the model we start with"; t983).
 * The environment's explicitly named default wins; otherwise the task's own provider's default, so a Flow that
 * names only DeepSeek runs DeepSeek's model, and anything else starts on Haiku. The build, its repairs and its
 * judge all ask here, so they can never resolve different models for one task.
 */
export function automationStudioLlmStartingModelId(providerId: unknown): string {
  if (AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED) return AUTOMATION_STUDIO_LLM_DEFAULT_MODEL;
  return providerId === "deepseek" ? "deepseek-flash" : "claude-haiku-5-5";
}
