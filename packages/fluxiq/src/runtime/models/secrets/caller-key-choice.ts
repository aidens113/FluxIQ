// Which saved key a person's model call uses, and so which provider and model.
//
// The key decides the provider, never the other way round. Until t924 the
// host bound the chat to the provider of the process-wide default model
// (`deepseek-flash` unless `FLUXIQ_LLM_DEFAULT_MODEL` named another) and then
// looked only for a key of that provider, so a person who saved an Anthropic
// key was told "No model key is set up yet" on every chat. This is the one
// choice the chat, a Flow call that names no provider, and the model-access
// state all make, so they cannot disagree about which key is in use.

import { automationStudioLlmModelProvider, automationStudioLlmProviderDefaultModel, type AutomationStudioLlmProviderId } from "../catalog/index.ts";
import { automationStudioSessionKeyProvider, type AutomationStudioSessionKeySummary } from "./session-key.ts";

/** The workspace's Settings choice (Secret Keys' `resolveAssistant()`): an id and its holder, never a value. */
export type AutomationStudioPreferredModelKey = {
  keyId: string;
  model?: string | undefined;
  /** The key's holder; absent for a legacy key nobody is stamped on. */
  ownerId?: string | undefined;
  /** An owner or administrator chose it as the workspace's key. */
  chosenForWorkspace?: boolean | undefined;
  /** Its holder offered it to the workspace. */
  offeredByHolder?: boolean | undefined;
};

export type AutomationStudioCallerModelKeyChoice =
  | {
    ok: true;
    key: AutomationStudioSessionKeySummary;
    provider: AutomationStudioLlmProviderId;
    model: string;
    /** Set when the key is another person's, lent to the workspace with both consents: release it as theirs. */
    keyOwnerUserId?: string;
  }
  | { ok: false; status: "no_key" | "not_permitted"; message: string };

export const AUTOMATION_STUDIO_NO_MODEL_KEY_MESSAGE = "No model key is set up yet, so add one in Settings, under AI keys.";
const NOT_CHOSEN = "The model key in Settings belongs to another person and has not been chosen for this workspace's messages, so add your own key in Settings, under AI keys, or ask an owner or administrator to choose one.";
const NOT_OFFERED = "The model key chosen for this workspace has not been offered to the workspace by the person who added it, so add your own key in Settings, under AI keys, or ask them to offer it.";

/**
 * The key `userId`'s call uses, in this order:
 *
 * 1. Their own choice (`ownKeyId`, the key they last saved for their own
 *    calls), while it is still their own enabled model key. It comes ahead of
 *    the workspace's key, and is nobody else's choice.
 * 2. The workspace's Settings choice, when it is theirs, a legacy key nobody is
 *    stamped on, or another person's key both chosen for the workspace and
 *    offered by its holder (exactly the panel assistant's consent rule).
 * 3. Otherwise their own newest enabled model key of any provider Core calls,
 *    then a legacy key nobody is stamped on.
 *
 * `keys` are Secret Keys' list, most recently changed first. Says `no_key` only
 * when no enabled model key at all could serve them, and `not_permitted` when
 * the only one is another person's without both consents.
 */
export function chooseAutomationStudioCallerModelKey(input: {
  keys: readonly AutomationStudioSessionKeySummary[];
  userId: string;
  preferred?: AutomationStudioPreferredModelKey | undefined;
  /** The key this person chose for their own calls (Secret Keys' `personKeyId`), if any; only ever their own. */
  ownKeyId?: string | undefined;
}): AutomationStudioCallerModelKeyChoice {
  const usable = input.keys.filter((key) => key.enabled && automationStudioSessionKeyProvider(key) !== undefined);
  const ownChoice = input.ownKeyId === undefined ? undefined : usable.find((key) => key.id === input.ownKeyId && key.createdBy === input.userId);
  // The workspace's model goes with its key, so it follows only when the person's own choice is that same key.
  if (ownChoice) return chosen(ownChoice, input.preferred?.keyId === ownChoice.id ? input.preferred.model : undefined);
  let refusal: string | undefined;
  const preferred = input.preferred ? usable.find((key) => key.id === input.preferred!.keyId) : undefined;
  if (preferred && input.preferred) {
    const owner = preferred.createdBy;
    if (owner === undefined || owner === input.userId) return chosen(preferred, input.preferred.model);
    if (input.preferred.chosenForWorkspace === true && input.preferred.offeredByHolder === true) return { ...chosen(preferred, input.preferred.model), keyOwnerUserId: owner };
    refusal = input.preferred.chosenForWorkspace === true ? NOT_OFFERED : NOT_CHOSEN;
  }
  const own = usable.find((key) => key.createdBy === input.userId) ?? usable.find((key) => key.createdBy === undefined);
  if (own) return chosen(own, undefined);
  return refusal ? { ok: false, status: "not_permitted", message: refusal } : { ok: false, status: "no_key", message: AUTOMATION_STUDIO_NO_MODEL_KEY_MESSAGE };
}

/** The key with its provider and model: the chosen model when it is that provider's, else the key's own, else the provider's default. */
function chosen(key: AutomationStudioSessionKeySummary, preferredModel: string | undefined): Extract<AutomationStudioCallerModelKeyChoice, { ok: true }> {
  const provider = automationStudioSessionKeyProvider(key)!;
  const own = typeof key.metadata?.model === "string" ? key.metadata.model : undefined;
  const model = [preferredModel, own].find((candidate) => candidate && automationStudioLlmModelProvider(candidate) === provider) ?? automationStudioLlmProviderDefaultModel(provider);
  return { ok: true, key, provider, model };
}
