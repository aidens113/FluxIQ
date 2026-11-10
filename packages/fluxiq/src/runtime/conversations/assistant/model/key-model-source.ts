// The assistant's model, from the key the person chose in Settings.
//
// Secret Keys says which key and model (`resolveAssistant()`, brief G: the
// assistant's own choice, else the workspace's default key). The value is
// released for each call to the person's own unlocked session, exactly as the
// chat window's key is (`releaseAutomationStudioSessionProviderKey`), and to
// that key and no other. Nothing here holds a value: the adapter asks for it
// per call and it lives only in that call's scope.
//
// Bound by the host, which holds Secret Keys (`programs/_shared/runtime.ts`).

import { createAutomationStudioAnthropicPanelCommandModel, createAutomationStudioDeepSeekPanelCommandModel, isAutomationStudioDeepSeekModel, releaseAutomationStudioSessionProviderKey, type AutomationStudioSessionKeyPorts } from "../../../llm/index.ts";
import { isAutomationStudioAnthropicModel } from "../../../models/index.ts";
import type { PanelAssistantModelSource } from "../types.ts";
import { panelAssistantModelOf } from "./conversation-model.ts";

/** What Secret Keys answers about the assistant's key: an id and a provider, never a value. */
export type PanelAssistantKeyChoice = { ok: true; keyId: string; keyName: string; provider?: string | undefined; model?: string | undefined } | { ok: false; reason: string };

/**
 * A model source over Secret Keys: `resolveAssistant` names the key and model,
 * `keyPorts` release the value per call. A key whose provider the assistant
 * cannot call, or a model that provider does not offer, is answered with a
 * plain reason rather than a guess at another.
 */
export function panelAssistantKeyModelSource(input: { resolveAssistant(): Promise<PanelAssistantKeyChoice>; keyPorts: AutomationStudioSessionKeyPorts; instanceHost?: string; fetchImpl?: typeof fetch }): PanelAssistantModelSource {
  return async () => {
    const choice = await input.resolveAssistant();
    if (!choice.ok) return { ok: false, reason: choice.reason };
    const provider = choice.provider?.trim().toLowerCase();
    const release = (wanted: "anthropic" | "deepseek") => async (caller: { userId: string; sessionId: string } | null): Promise<string> => {
      if (!caller) throw new Error("No signed-in person sent this message, so no model key can be released for it.");
      return await releaseAutomationStudioSessionProviderKey(input.keyPorts, caller, { provider: wanted, flowKeyId: choice.keyId, ...(choice.model ? { model: choice.model } : {}), ...(input.instanceHost ? { instanceHost: input.instanceHost } : {}) });
    };
    const fetching = input.fetchImpl ? { fetchImpl: input.fetchImpl } : {};
    if (provider === "anthropic") {
      if (choice.model !== undefined && !isAutomationStudioAnthropicModel(choice.model)) return { ok: false, reason: `The model chosen for “${choice.keyName}” is not one FluxIQ can use. Pick another in Settings.` };
      return { ok: true, model: panelAssistantModelOf(createAutomationStudioAnthropicPanelCommandModel({ resolveKey: release("anthropic"), ...fetching, ...(choice.model ? { model: choice.model } : {}) })) };
    }
    if (provider === "deepseek") {
      if (choice.model !== undefined && !isAutomationStudioDeepSeekModel(choice.model)) return { ok: false, reason: `The model chosen for “${choice.keyName}” is not one FluxIQ can use. Pick another in Settings.` };
      return { ok: true, model: panelAssistantModelOf(createAutomationStudioDeepSeekPanelCommandModel({ resolveKey: release("deepseek"), ...fetching, ...(choice.model ? { model: choice.model } : {}) })) };
    }
    return { ok: false, reason: `The assistant cannot use “${choice.keyName}” yet: FluxIQ's assistant works with Anthropic and DeepSeek keys. Choose another key in Settings.` };
  };
}
