import { automationStudioRunOverrides } from "../../run-overrides/index.ts";
import { automationStudioLlmStartingModelId } from "./starting-model.ts";

/**
 * A runtime check keeps the task's starting model; historical judge overrides cannot switch it. With no model
 * named, it is the default of the Flow's own provider (`./starting-model.ts`), the one its build resolves, so a
 * Flow that names only DeepSeek is not judged on a Claude model its provider cannot serve.
 */
export function automationStudioLlmRunJudgeModelId(fallback: unknown, providerId?: unknown): string | undefined {
  return automationStudioRunOverrides()?.models?.explore ?? (typeof fallback === "string" ? fallback : undefined)
    ?? automationStudioLlmStartingModelId(providerId);
}
