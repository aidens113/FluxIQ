// A free check of a model key with its provider (t928): lists the provider's models (Anthropic) or reads
// the account's balance (DeepSeek), neither of which is billed. The key is sent only in the request's
// header; it is never logged, thrown or put in a message.

import { AUTOMATION_STUDIO_ANTHROPIC_API_VERSION, AUTOMATION_STUDIO_ANTHROPIC_MESSAGES_URL, AUTOMATION_STUDIO_DEEPSEEK_ORIGIN } from "../../providers/index.ts";
import { automationStudioProviderBalanceExhausted } from "../../transport/index.ts";
import { automationStudioLlmProviderLabel } from "../../catalog/index.ts";
import { automationStudioModelAccessRefusedMessage, automationStudioModelAccessUnreachableMessage } from "./state.ts";

export type AutomationStudioModelKeyCheckProvider = "anthropic" | "deepseek";
export type AutomationStudioModelKeyCheckOutcome = "answered" | "provider_refused" | "no_credit" | "provider_unreachable";
export type AutomationStudioModelKeyCheckInput = {
  provider: AutomationStudioModelKeyCheckProvider;
  value: string;
  fetch?: typeof fetch | undefined;
  signal?: AbortSignal | undefined;
};
export type AutomationStudioModelKeyCheckResult = { outcome: AutomationStudioModelKeyCheckOutcome; message?: string };

const ANTHROPIC_MODELS_URL = AUTOMATION_STUDIO_ANTHROPIC_MESSAGES_URL.replace(/\/messages$/u, "/models");
const CHECK_TIMEOUT_MS = 15_000;
/** A body that is not JSON: said apart from an empty one, so a caller can tell a bad answer from none. */
const UNREADABLE = Symbol("unreadable body");

/** Asks the provider whether the key works and its account has credit, without a billed call. */
export async function checkAutomationStudioModelKey(input: AutomationStudioModelKeyCheckInput): Promise<AutomationStudioModelKeyCheckResult> {
  const send = input.fetch ?? fetch;
  const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(CHECK_TIMEOUT_MS)]) : AbortSignal.timeout(CHECK_TIMEOUT_MS);
  const label = automationStudioLlmProviderLabel(input.provider);
  const get = async (url: string, headers: Record<string, string>): Promise<{ status: number; json: unknown } | "unreachable"> => {
    try {
      const response = await send(url, { method: "GET", headers: { accept: "application/json", ...headers }, redirect: "error", signal });
      let json: unknown;
      try {
        json = await response.json();
      } catch {
        json = UNREADABLE;
      }
      return { status: response.status, json };
    } catch {
      return "unreachable";
    }
  };
  const unreachable = (): AutomationStudioModelKeyCheckResult => ({ outcome: "provider_unreachable", message: automationStudioModelAccessUnreachableMessage(input.provider) });
  const refused = (): AutomationStudioModelKeyCheckResult => ({ outcome: "provider_refused", message: automationStudioModelAccessRefusedMessage(input.provider) });
  const noCredit = (): AutomationStudioModelKeyCheckResult => ({ outcome: "no_credit", message: `${label} says the account behind this key has no credit left.` });
  /** A failed answer's outcome, or undefined when the status is a success. */
  const failure = (reply: { status: number; json: unknown }): AutomationStudioModelKeyCheckResult | undefined => {
    if (reply.status >= 200 && reply.status < 300) return undefined;
    if (reply.status === 401 || reply.status === 403) return refused();
    if (automationStudioProviderBalanceExhausted(reply.status, errorFields(reply.json))) return noCredit();
    return unreachable();
  };

  if (input.provider === "anthropic") {
    const reply = await get(ANTHROPIC_MODELS_URL, { "x-api-key": input.value, "anthropic-version": AUTOMATION_STUDIO_ANTHROPIC_API_VERSION });
    if (reply === "unreachable") return unreachable();
    return failure(reply) ?? { outcome: "answered" };
  }
  const bearer = { authorization: `Bearer ${input.value}` };
  const models = await get(`${AUTOMATION_STUDIO_DEEPSEEK_ORIGIN}/models`, bearer);
  if (models === "unreachable") return unreachable();
  const modelsFailure = failure(models);
  if (modelsFailure) return modelsFailure;
  const balance = await get(`${AUTOMATION_STUDIO_DEEPSEEK_ORIGIN}/user/balance`, bearer);
  if (balance === "unreachable") return unreachable();
  const balanceFailure = failure(balance);
  if (balanceFailure) return balanceFailure;
  const body = balance.json && typeof balance.json === "object" ? balance.json as { is_available?: unknown; balance_infos?: unknown } : undefined;
  if (!body) return unreachable();
  if (body.is_available === false) return noCredit();
  const infos = Array.isArray(body.balance_infos) ? body.balance_infos : [];
  const positive = infos.some((info) => info && typeof info === "object" && Number((info as { total_balance?: unknown }).total_balance) > 0);
  return positive ? { outcome: "answered" } : noCredit();
}

function errorFields(json: unknown): { code?: unknown; type?: unknown; message?: unknown } | undefined {
  const error = json && typeof json === "object" ? (json as { error?: unknown }).error : undefined;
  return error && typeof error === "object" ? error as { code?: unknown; type?: unknown; message?: unknown } : undefined;
}
