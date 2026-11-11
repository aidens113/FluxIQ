// The token limits of the model a provider is bound to, where it says them (W3, t899).
//
// A run may give each role its own model (`../role-routing/`), and every model call is
// measured, held and sent at the model that serves it (`ModelProvider.servedBy`). Its
// size has to be held to that model's window too: a request built to the explore
// model's limits and sent to a judge with a smaller window was refused by the judge's
// adapter, by size, and the judge read that as "not judged". So a role's provider says
// its model's limits, as its resolution gave them, and the harness builds and checks
// the request to them (`./sized-request.ts`).
//
// **They travel in the provider's metadata**, under one key of its free `metadata`
// bag: a decorator forwards `metadata` as it stands and re-applies itself to whatever
// `servedBy` answers (`../domain-instructions/provider.ts`), so what the served
// provider says reaches the harness through any number of them. A provider that says
// nothing is held to the caller's limits, exactly as before.

import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioLlmTokenLimits } from "../../models/limits/index.ts";
import type { AutomationStudioLlmProvider } from "./provider.ts";

/** The key, in a provider's `metadata.metadata`, under which it says its model's token limits. */
const SERVED_TOKEN_LIMITS_KEY = "servedTokenLimits";
const LIMIT_KEYS = ["maxInputTokens", "maxOutputTokens", "maxTotalTokens"] as const;

/**
 * `provider`, saying `limits` as its model's: every member forwarded to it as it is, and
 * its metadata the same but for the limits. The harness holds every request this
 * provider serves to them in place of the caller's.
 */
export function automationStudioLlmProviderWithTokenLimits(provider: AutomationStudioLlmProvider, limits: Partial<AutomationStudioLlmTokenLimits>): AutomationStudioLlmProvider {
  const said: JsonObject = {};
  for (const key of LIMIT_KEYS) if (limits[key] !== undefined) said[key] = limits[key];
  return {
    metadata: { ...provider.metadata, metadata: { ...provider.metadata.metadata, [SERVED_TOKEN_LIMITS_KEY]: said } },
    runTask: async (request, execution) => await provider.runTask(request, execution),
    ...(provider.whenReady ? { whenReady: async (request: Parameters<AutomationStudioLlmProvider["runTask"]>[0], execution?: { signal?: AbortSignal }) => await provider.whenReady?.(request, execution) } : {}),
    ...(provider.observeHolds ? { observeHolds: (listener: (state: "started" | "ended", heldMs: number) => void) => provider.observeHolds!(listener) } : {}),
    ...(provider.measureInput ? { measureInput: (request: Parameters<AutomationStudioLlmProvider["runTask"]>[0]) => provider.measureInput!(request) } : {}),
    ...(provider.estimateCostUsd ? { estimateCostUsd: (tokens: { inputTokens: number; outputTokens: number }) => provider.estimateCostUsd!(tokens) } : {})
  };
}

/** The token limits `provider` says are its model's, or nothing where it says none. Numbers are read as given: the harness's own resolution refuses one that is not a whole positive number, as it refuses a caller's. */
export function automationStudioLlmServedTokenLimits(provider: AutomationStudioLlmProvider | undefined): Partial<AutomationStudioLlmTokenLimits> | undefined {
  const said = provider?.metadata.metadata?.[SERVED_TOKEN_LIMITS_KEY];
  if (!said || typeof said !== "object" || Array.isArray(said)) return undefined;
  const limits: Partial<AutomationStudioLlmTokenLimits> = {};
  for (const key of LIMIT_KEYS) {
    const value = (said as JsonObject)[key];
    if (typeof value === "number") limits[key] = value;
  }
  return Object.keys(limits).length ? limits : undefined;
}
