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
// key nobody is stamped on). No key is ever shared automatically: another
// person's key pays for the sender's message only when an owner or
// administrator chose it as the workspace's key (`chosenForWorkspace`) and its
// holder offered it to the workspace (`offeredByHolder`). Then it is released
// server-side, for this one call, to the holder's own live panel unlock, the
// only thing that can open a key sealed under their password. The sender never
// holds, reads or names its value. Otherwise the sender is answered in plain
// words naming who can choose one, and no model is called. When no unlock of
// the holder holds it the call ends with the typed `secrets.locked` error,
// worded for the workspace's key, never another key.
//
// Bound by the host, which holds Secret Keys (`programs/_shared/runtime.ts`).
// Each release checks the current choice and consent before and after the
// asynchronous unlock/reveal. A turn's earlier choice never authorizes a
// later call after that choice or the holder's offer has changed.

import { AutomationStudioSecretsLockedError, createAutomationStudioAnthropicPanelCommandModel, createAutomationStudioDeepSeekPanelCommandModel, isAutomationStudioDeepSeekModel, releaseAutomationStudioSessionProviderKey, type AutomationStudioSessionKeyPorts } from "../../../llm/index.ts";
import { isAutomationStudioAnthropicModel } from "../../../models/index.ts";
import type { PanelAssistantModel, PanelAssistantModelSource } from "../types.ts";
import { panelAssistantModelOf } from "./conversation-model.ts";
import { PanelAssistantWorkspaceKeyLockedError } from "./workspace-key-locked-error.ts";

/**
 * What Secret Keys answers about the assistant's key: an id, a provider and its
 * holder, never a value. It may pay for other people's messages only when both
 * `chosenForWorkspace` (an owner or administrator chose it as the workspace's
 * key) and `offeredByHolder` (its holder offered it to the workspace) are true;
 * either left out counts as false.
 */
export type PanelAssistantKeyChoice = { ok: true; keyId: string; keyName: string; provider?: string | undefined; model?: string | undefined; ownerId?: string | undefined; chosenForWorkspace?: boolean | undefined; offeredByHolder?: boolean | undefined } | { ok: false; reason: string };

/** Said when the key the assistant would use is someone else's and nobody chose it as the workspace's key. */
const NOT_CHOSEN = "No model key has been chosen for this workspace's messages yet. An owner or administrator of this workspace chooses one in Settings, from a key its holder has offered to the workspace.";

/** Said when the workspace's chosen key is someone else's and its holder has not offered it. */
const NOT_OFFERED = "The key chosen for this workspace's messages has not been offered to the workspace by the person who added it, so it pays only for their own messages. They can offer it in Settings, or an owner or administrator of this workspace can choose another.";

const CHOICE_CHANGED = "The model key or model chosen for this workspace's messages has changed. Send the message again to use the current choice in Settings.";

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
    const refusal = lentTo(choice, sender.userId) ? notReleasable(choice) : undefined;
    if (refusal) return { ok: false, reason: refusal };
    const provider = choice.provider?.trim().toLowerCase();
    // The adapters wrap key lookup errors, so preserve known consent refusals
    // and typed locks without exposing an unrelated internal lookup failure.
    let releaseFailure: Error | undefined;
    const refuseRelease = (reason: string): never => {
      releaseFailure = new Error(reason);
      throw releaseFailure;
    };
    const checkCurrentChoice = async (userId: string): Promise<void> => {
      const current = await input.resolveAssistant();
      if (!current.ok) return refuseRelease(current.reason);
      if (current.keyId !== choice.keyId || current.provider?.trim().toLowerCase() !== provider || current.model !== choice.model || current.ownerId !== choice.ownerId) refuseRelease(CHOICE_CHANGED);
      const refusal = lentTo(current, userId) ? notReleasable(current) : undefined;
      if (refusal) refuseRelease(refusal);
    };
    const release = (wanted: "anthropic" | "deepseek") => async (caller: { userId: string; sessionId: string } | null): Promise<string> => {
      if (!caller) throw new Error("No signed-in person sent this message, so no model key can be released for it.");
      await checkCurrentChoice(caller.userId);
      const lent = lentTo(choice, caller.userId);
      // Lent: the holder's own live panel unlock (the host's fallback for a caller with no session of its own), never the sender's.
      const payer = lent && choice.ownerId ? { userId: choice.ownerId, sessionId: null } : caller;
      try {
        const value = await releaseAutomationStudioSessionProviderKey(input.keyPorts, payer, { provider: wanted, flowKeyId: choice.keyId, ...(choice.model ? { model: choice.model } : {}), ...(input.instanceHost ? { instanceHost: input.instanceHost } : {}) });
        await checkCurrentChoice(caller.userId);
        return value;
      } catch (error) {
        if (!(error instanceof AutomationStudioSecretsLockedError)) throw error;
        // The holder sees their own words; anyone else is told it is the workspace's key, and its owner unlocks it.
        releaseFailure = lent ? new PanelAssistantWorkspaceKeyLockedError({ instanceHost: input.instanceHost, cause: error }) : error;
        throw releaseFailure;
      }
    };
    const typed = (model: PanelAssistantModel): PanelAssistantModel => ({
      name: model.name,
      decide: async (request, execution) => {
        releaseFailure = undefined;
        try {
          return await model.decide(request, execution);
        } catch (error) {
          throw releaseFailure ?? error;
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

/** Why another person's key may not pay for this message, or undefined when it may: it must be both chosen for the workspace and offered by its holder. */
function notReleasable(choice: { chosenForWorkspace?: boolean | undefined; offeredByHolder?: boolean | undefined }): string | undefined {
  if (choice.chosenForWorkspace !== true) return NOT_CHOSEN;
  if (choice.offeredByHolder !== true) return NOT_OFFERED;
  return undefined;
}

/** Whether the key is another person's than `userId`'s. A key with no owner stamp is released only to the caller's own unlock, as before. */
function lentTo(choice: { ownerId?: string | undefined }, userId: string): boolean {
  return choice.ownerId !== undefined && choice.ownerId !== userId;
}
