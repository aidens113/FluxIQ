// A provider resolution narrowed by the spend limits the Flow itself configures.
//
// A Flow's settings may store `llmExecutionSettings`: a call count, per-call
// token limits, a per-call timeout and a per-call cost ceiling. Since grants
// went (t186) the host's resolver hands back its own defaults and nothing read
// these, so a Flow configured for 48 calls was built with 64
// (`run-munnq7vz-98c3481c`). This is where the two that bound spending are
// read: the call count and the per-call cost. It is arithmetic only: it sets
// numbers the run's own budget already enforces, adds no check, refuses
// nothing and issues nothing, and each can only lower what the resolution (or,
// where it names nothing, the harness default) allows.
//
// The token limits and the timeout are deliberately not read. They size one
// request rather than bound spending, and a Flow saved from the web app stores
// 8,000 / 2,000 / 10,000 tokens and 20 s by default
// (`apps/web/.../settings/flow-settings-model.ts`), far below what describing a
// real page needs and what the resolver sizes a request to
// (`../session-key-provider.ts`); narrowing by them would starve every
// panel-built Flow's build and repair.
//
// The bounds mirror the settings check in `api/handlers/llm-execution-
// settings.ts`, which refuses a save outside them; a stored value outside them
// is ignored here rather than trusted. The web app writes a call count of 1
// when nobody configured one (`FLOW_LLM_UNSET_CALL_COUNT`), so 1 reads as unset.

import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_DEFAULT_MAX_ESTIMATED_COST_USD } from "../harness/index.ts";
import type { AutomationStudioLlmProviderResolution } from "../resolver-contract.ts";

const FLOW_MAX_CALLS = 64;
const FLOW_UNSET_CALL_COUNT = 1;
const FLOW_MAX_COST_USD = 0.25;

/**
 * `resolved` narrowed by the Flow's stored `llmExecutionSettings`: `maxCalls`
 * becomes (or lowers) `maxCallsPerRun`, and `maxEstimatedCostUsd` lowers the
 * per-call cost ceiling. Token limits and the timeout are left as resolved.
 * Anything that is not a resolution -- nothing, or a bare provider -- is
 * returned as it came.
 */
export function automationStudioLlmResolutionWithinFlowSettings<T>(resolved: T, flowMetadata: JsonObject | undefined): T {
  if (!resolved || typeof resolved !== "object" || !("provider" in resolved)) return resolved;
  const settings = record(flowMetadata?.llmExecutionSettings);
  if (!settings) return resolved;
  const resolution = resolved as unknown as AutomationStudioLlmProviderResolution;
  const narrowed: AutomationStudioLlmProviderResolution = { ...resolution };
  const calls = wholeNumber(settings.maxCalls, 1, FLOW_MAX_CALLS);
  if (calls !== undefined && calls !== FLOW_UNSET_CALL_COUNT) narrowed.maxCallsPerRun = lower(resolution.maxCallsPerRun, calls);
  const cost = settings.maxEstimatedCostUsd;
  if (typeof cost === "number" && Number.isFinite(cost) && cost > 0 && cost <= FLOW_MAX_COST_USD) {
    narrowed.maxEstimatedCostUsd = Math.min(resolution.maxEstimatedCostUsd ?? AUTOMATION_STUDIO_LLM_DEFAULT_MAX_ESTIMATED_COST_USD, cost);
  }
  return narrowed as unknown as T;
}

function lower(current: number | undefined, limit: number): number {
  return typeof current === "number" && Number.isFinite(current) && current >= 1 ? Math.min(Math.trunc(current), limit) : limit;
}

function wholeNumber(value: unknown, minimum: number, maximum: number): number | undefined {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum ? value as number : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
