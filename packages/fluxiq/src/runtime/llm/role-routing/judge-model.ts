import { AUTOMATION_STUDIO_LLM_DEFAULT_MODEL, AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED } from "../../models/catalog/index.ts";
import { automationStudioRunOverrides } from "../../run-overrides/index.ts";

/** A runtime check keeps the task's starting model; historical judge overrides cannot switch it. */
export function automationStudioLlmRunJudgeModelId(fallback: unknown): string | undefined {
  return automationStudioRunOverrides()?.models?.explore ?? (typeof fallback === "string" ? fallback : undefined)
    ?? (AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED ? AUTOMATION_STUDIO_LLM_DEFAULT_MODEL : "claude-haiku-5-5");
}
