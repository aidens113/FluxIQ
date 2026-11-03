import { AUTOMATION_STUDIO_LLM_BUILD_CALL_LIMIT_ENV } from "./env.ts";
import { AUTOMATION_STUDIO_LLM_BUILD_CALL_LIMIT_SCOPE_ENV } from "./scope-env.ts";

/** An optional test-owned build allowance; ordinary users have no implicit limit. */
export function resolveAutomationStudioLlmBuildCallLimit(env: Readonly<Record<string, string | undefined>> = process.env): number | undefined {
  if (env[AUTOMATION_STUDIO_LLM_BUILD_CALL_LIMIT_SCOPE_ENV] !== "test") return undefined;
  const raw = env[AUTOMATION_STUDIO_LLM_BUILD_CALL_LIMIT_ENV];
  if (raw === undefined) return undefined;
  const value = /^\d+$/u.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("The test build call limit must be a positive safe integer.");
  return value;
}
