// The assistant's model, from the key the person chose in Settings.
//
// Secret Keys says which key and model (`resolveAssistant()`, brief G: the
// assistant's own choice, else the workspace's default key). The value is
// released for each call, exactly as the chat window's key is
// (`releaseAutomationStudioSessionProviderKey`), and to that key and no other.
// Nothing here holds a value: the adapter asks for it per call and it lives
// only in that call's scope.
//
// Whose unlock opens it. The sender's own, when the key is theirs (or a legacy
// key nobody is stamped on). When it is another person's, it is the
// workspace's key only if its owner chose it for the workspace
// (`sharedByOwner`); then it is released server-side, for this one call, to the
// owner's own live panel unlock, the only thing that can open a key sealed
// under their password. The sender never holds, reads or names its value. A key
// its owner did not share is never used for someone else, and when no unlock
// of the owner holds it the call ends with the typed `secrets.locked` error,
// never another key.
//
// Bound by the host, which holds Secret Keys (`programs/_shared/runtime.ts`).

import { AutomationStudioSecretsLockedError, createAutomationStudioAnthropicPanelCommandModel, createAutomationStudioDeepSeekPanelCommandModel, isAutomationStudioDeepSeekModel, releaseAutomationStudioSessionProviderKey, type AutomationStudioSessionKeyPorts } from "../../../llm/index.ts";
import { isAutomationStudioAnthropicModel } from "../../../models/index.ts";
import type { PanelAssistantModel, PanelAssistantModelSource } from "../types.ts";
import { panelAssistantModelOf } from "./conversation-model.ts";

/**
 * What Secret Keys answers about the assistant's key: an id, a provider and an
 * owner, never a value. `sharedByOwner`: its owner chose it as the workspace's
 * key, so it may pay for other people's messages.
 */
export type PanelAssistantKeyChoice = { ok: true; keyId: string; keyName: string; provider?: string | undefined; model?: string | undefined; ownerId?: string | undefined; sharedByOwner?: boolean | undefined } | { ok: false; reason: string };

/** Said to a person when the assistant's key is someone else's and its owner did not share it with the workspace. */
const NOT_SHARED = "The assistant's key belongs to another person, who has not chosen it as this workspace's key. Ask them to choose it in Settings, or add a key of your own.";

/**
 * A model source over Secret Keys: `resolveAssistant` names the key and model,
 * `keyPorts` release the value per call. A key whose provider the assistant
 * cannot call, or a model that provider does not offer, is answered with a
 * plain reason rather than a guess at another.
 */
export function panelAssistantKeyModelSource(input: { resolveAssistant(): Promise<PanelAssistantKeyChoice>; keyPorts: AutomationStudioSessionKeyPorts; instanceHost?: string; fetchImpl?: typeof fetch }): PanelAssistantModelSource {
  return async (sender) => {
    const choice = await input.resolveAssistant();
    if (!choice.ok) return { ok: false, reason: choice.reason };
    if (lentTo(choice, sender.userId) && !choice.sharedByOwner) return { ok: false, reason: NOT_SHARED };
    const provider = choice.provider?.trim().toLowerCase();
    // The adapters turn any throw from the key lookup into a generic provider error, so a lock is remembered here and rethrown typed.
    let locked: AutomationStudioSecretsLockedError | undefined;
    const release = (wanted: "anthropic" | "deepseek") => async (caller: { userId: string; sessionId: string } | null): Promise<string> => {
      if (!caller) throw new Error("No signed-in person sent this message, so no model key can be released for it.");
      const lent = lentTo(choice, caller.userId);
      if (lent && !choice.sharedByOwner) throw new Error(NOT_SHARED);
      // Lent: the owner's own live panel unlock (the host's fallback for a caller with no session of its own), never the sender's.
      const payer = lent && choice.ownerId ? { userId: choice.ownerId, sessionId: null } : caller;
      try {
        return await releaseAutomationStudioSessionProviderKey(input.keyPorts, payer, { provider: wanted, flowKeyId: choice.keyId, ...(choice.model ? { model: choice.model } : {}), ...(input.instanceHost ? { instanceHost: input.instanceHost } : {}) });
      } catch (error) {
        if (error instanceof AutomationStudioSecretsLockedError) locked = error;
        throw error;
      }
    };
    const typed = (model: PanelAssistantModel): PanelAssistantModel => ({
      name: model.name,
      decide: async (request, execution) => {
        locked = undefined;
        try {
          return await model.decide(request, execution);
        } catch (error) {
          throw locked ?? error;
        }
      }
    });
    const fetching = input.fetchImpl ? { fetchImpl: input.fetchImpl } : {};
    if (provider === "anthropic") {
      if (choice.model !== undefined && !isAutomationStudioAnthropicModel(choice.model)) return { ok: false, reason: `The model chosen for “${choice.keyName}” is not one FluxIQ can use. Pick another in Settings.` };
      return { ok: true, model: typed(panelAssistantModelOf(createAutomationStudioAnthropicPanelCommandModel({ resolveKey: release("anthropic"), ...fetching, ...(choice.model ? { model: choice.model } : {}) }))) };
    }
    if (provider === "deepseek") {
      if (choice.model !== undefined && !isAutomationStudioDeepSeekModel(choice.model)) return { ok: false, reason: `The model chosen for “${choice.keyName}” is not one FluxIQ can use. Pick another in Settings.` };
      return { ok: true, model: typed(panelAssistantModelOf(createAutomationStudioDeepSeekPanelCommandModel({ resolveKey: release("deepseek"), ...fetching, ...(choice.model ? { model: choice.model } : {}) }))) };
    }
    return { ok: false, reason: `The assistant cannot use “${choice.keyName}” yet: FluxIQ's assistant works with Anthropic and DeepSeek keys. Choose another key in Settings.` };
  };
}

/** Whether the key is another person's than `userId`'s. A key with no owner stamp is released only to the caller's own unlock, as before. */
function lentTo(choice: { ownerId?: string | undefined }, userId: string): boolean {
  return choice.ownerId !== undefined && choice.ownerId !== userId;
}
