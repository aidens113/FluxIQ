// A person's model access: whether their calls can reach a model now, and when
// they cannot, the one real reason (t924). The chat answers with the same
// words the state carries, so what a person reads in the thread and what a
// client shows beside it never disagree.
//
// The state comes from two things: the key the person's calls would use
// (`caller-key-choice.ts`) with whether this server can open it, and how the
// last call on that key went since the key last changed (`ledger.ts`).

import type { ModelAccessKey, ModelAccessState, ModelAccessUnopenableCode, ModelKeyAvailability, ModelAccessCallOutcome } from "@fluxiq/contracts/platform";
import { automationStudioLlmProviderLabel, type AutomationStudioLlmProviderId } from "../../catalog/index.ts";
import { chooseAutomationStudioCallerModelKey, type AutomationStudioCallerModelKeyChoice, type AutomationStudioPreferredModelKey } from "../caller-key-choice.ts";
import type { AutomationStudioSessionKeySummary } from "../session-key.ts";
import type { AutomationStudioModelAccessLedger } from "./ledger.ts";

/** The key as the state names it: id, name, provider and model, never a value. */
export function automationStudioModelAccessKey(choice: Extract<AutomationStudioCallerModelKeyChoice, { ok: true }>): ModelAccessKey {
  return { id: choice.key.id, name: choice.key.name ?? choice.key.id, provider: choice.provider, model: choice.model };
}

/**
 * The person's state now, from Secret Keys' list as they see it (each key's
 * `availability` for them, when the list carries it) and the ledger.
 */
export function automationStudioModelAccessState(input: {
  keys: readonly (AutomationStudioSessionKeySummary & { availability?: ModelKeyAvailability | null | undefined })[];
  userId: string;
  preferred?: AutomationStudioPreferredModelKey | undefined;
  ledger: AutomationStudioModelAccessLedger;
}): ModelAccessState {
  const choice = chooseAutomationStudioCallerModelKey(input);
  if (!choice.ok) return { status: choice.status, message: choice.message, key: null, lastCall: null };
  const key = automationStudioModelAccessKey(choice);
  const availability = input.keys.find((entry) => entry.id === choice.key.id)?.availability;
  if (availability?.state === "unavailable") return automationStudioModelAccessUnopenable(key, availability.code);
  const lastCall = input.ledger.lastCall(choice.key);
  const said = input.ledger.lastMessage(choice.key);
  if (lastCall?.outcome === "provider_refused") return { status: "provider_refused", message: said ?? automationStudioModelAccessRefusedMessage(choice.provider), key, lastCall };
  if (lastCall?.outcome === "no_credit") return { status: "no_credit", message: automationStudioModelAccessBalanceMessage(choice.provider, key.name), key, lastCall };
  if (lastCall?.outcome === "provider_unreachable") return { status: "provider_unreachable", message: said ?? automationStudioModelAccessUnreachableMessage(choice.provider), key, lastCall };
  return { status: "ready", message: `Chats use the key “${key.name}” with ${automationStudioLlmProviderLabel(choice.provider)} (${choice.model}).`, key, lastCall };
}

export function automationStudioModelAccessUnopenable(key: ModelAccessKey, code: ModelAccessUnopenableCode): ModelAccessState {
  const message = code === "legacy_recovery_required"
    ? "The saved model key is in an old format, and it is upgraded automatically the next time its owner signs in to the FluxIQ panel."
    : code === "host_protection_unavailable"
      ? "The saved model key could not be opened because this server's key protection is unavailable, so restart FluxIQ on the machine that saved the key, or add the key again in Settings, under AI keys."
      : "The saved model key could not be opened because its stored value is damaged, so add it again in Settings, under AI keys.";
  return { status: "key_unopenable", message, key, lastCall: null, unopenableCode: code };
}

export function automationStudioModelAccessRefusedMessage(provider: AutomationStudioLlmProviderId): string {
  return `${automationStudioLlmProviderLabel(provider)} refused the saved model key, so check or replace it in Settings, under AI keys.`;
}

export function automationStudioModelAccessUnreachableMessage(provider: AutomationStudioLlmProviderId): string {
  return `${automationStudioLlmProviderLabel(provider)} could not be reached, so check this server's internet connection and try again.`;
}

/** A balance refusal is the provider refusing the key's account: said as such, with its own fix. */
export function automationStudioModelAccessBalanceMessage(provider: AutomationStudioLlmProviderId, keyName: string): string {
  return `${automationStudioLlmProviderLabel(provider)} says the account behind ${keyName} has no credit left.`;
}

/** Which access outcome a failed provider call was, from its code; undefined when it says nothing about access (a slow or malformed answer). */
export function automationStudioModelAccessOutcomeOf(error: unknown): Exclude<ModelAccessCallOutcome, "answered"> | undefined {
  const code = typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "";
  if (code === "llm.provider_balance_exhausted") return "no_credit";
  if (code === "llm.provider_auth_failed") return "provider_refused";
  if (code === "llm.provider_network_error" || code === "llm.provider_redirect_rejected") return "provider_unreachable";
  return undefined;
}
