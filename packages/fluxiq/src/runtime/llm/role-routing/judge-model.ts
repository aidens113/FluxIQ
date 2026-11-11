import { automationStudioRunOverrides } from "../../run-overrides/index.ts";

/**
 * The model a run's result check asks for: the run's own judge model
 * (`AutomationStudioRunOverrides["models"].judge`), else `fallback` -- the
 * Flow's model -- where it is a string. A check resolves its one provider on its
 * own path (`resolveAutomationStudioResultCheckProvider`), and every call it
 * makes is a judge's, so it takes the judge's model there and routes nothing.
 */
export function automationStudioLlmRunJudgeModelId(fallback: unknown): string | undefined {
  return automationStudioRunOverrides()?.models?.judge ?? (typeof fallback === "string" ? fallback : undefined);
}
