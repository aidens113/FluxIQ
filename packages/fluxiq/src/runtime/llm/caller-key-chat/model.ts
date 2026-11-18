// The chat window's model: the provider of the key the sender's call uses.
//
// The host used to bind one provider's chat model at startup, the provider of
// the process-wide default model, and look only for a key of that provider. A
// person whose saved key was another provider's was told no key existed (t924).
// Here each call first chooses the key (`chooseAutomationStudioCallerModelKey`,
// the same choice the model-access state makes), then reads the message with
// that key's provider and model, releasing exactly that key for the sender.
//
// Every way the call cannot reach a model ends in an
// `AutomationStudioModelAccessError` carrying the person's model-access state:
// no key, a key this server cannot open, a key they may not use, the provider
// refusing the key, or the provider out of reach. The conversation answers with
// that state's words, and the ledger keeps the last call's outcome for the
// state clients read. A slow or malformed answer is not an access failure and
// passes through as it was, for the conversation's own retry.

import type { ModelAccessKey, ModelAccessState } from "@fluxiq/contracts/platform";
import type { AutomationStudioConversationModel } from "../../conversations/index.ts";
import {
  AutomationStudioModelAccessError,
  automationStudioModelAccessBalanceMessage,
  automationStudioModelAccessKey,
  automationStudioModelAccessOutcomeOf,
  automationStudioModelAccessRefusedMessage,
  automationStudioModelAccessUnopenable,
  automationStudioModelAccessUnreachableMessage,
  chooseAutomationStudioCallerModelKey,
  releaseAutomationStudioSessionProviderKey,
  AUTOMATION_STUDIO_NO_MODEL_KEY_MESSAGE,
  type AutomationStudioModelAccessLedger,
  type AutomationStudioPreferredModelKey,
  type AutomationStudioSessionKeyPorts
} from "../../models/secrets/index.ts";
import { createAutomationStudioAnthropicPanelCommandModel } from "../anthropic/index.ts";
import { createAutomationStudioDeepSeekPanelCommandModel } from "../deepseek/index.ts";
import type { AutomationStudioAnthropicModel, AutomationStudioDeepSeekModel } from "../../models/catalog/index.ts";

export type AutomationStudioCallerKeyChatModelOptions = {
  /** Secret Keys' operations, the same ports every per-use release goes through. */
  ports: AutomationStudioSessionKeyPorts;
  /** The workspace's Settings choice, read for every call; absent or undefined when there is none. */
  preferred?: () => Promise<AutomationStudioPreferredModelKey | undefined>;
  /** Where each call's outcome is noted for the model-access state. */
  ledger: AutomationStudioModelAccessLedger;
  fetchImpl?: typeof fetch;
};

const NO_SENDER = "No signed-in person sent this message, so no model key can be released for it.";
const UNOPENABLE_CODES = ["legacy_recovery_required", "host_protection_unavailable", "ciphertext_invalid"] as const;

export function createAutomationStudioCallerKeyChatModel(options: AutomationStudioCallerKeyChatModelOptions): AutomationStudioConversationModel {
  return {
    name: "caller-key",
    decide: async (request, execution) => {
      const caller = execution.caller;
      if (!caller) throw new AutomationStudioModelAccessError({ status: "not_permitted", message: NO_SENDER, key: null, lastCall: null });
      const { keys } = await options.ports.snapshot();
      const choice = chooseAutomationStudioCallerModelKey({ keys, userId: caller.userId, preferred: await options.preferred?.() });
      if (!choice.ok) throw new AutomationStudioModelAccessError({ status: choice.status, message: choice.message, key: null, lastCall: null });
      const key = automationStudioModelAccessKey(choice);
      // The adapters wrap a failed release in their own error; the cause is kept here to name it.
      let releaseFailure: unknown;
      const resolveKey = async (): Promise<string> => {
        try {
          return await releaseAutomationStudioSessionProviderKey(options.ports, caller, {
            provider: choice.provider, flowKeyId: choice.key.id,
            ...(choice.keyOwnerUserId ? { keyOwnerUserId: choice.keyOwnerUserId } : {})
          });
        } catch (error) {
          releaseFailure = error;
          throw error;
        }
      };
      const fetching = options.fetchImpl ? { fetchImpl: options.fetchImpl } : {};
      const model = choice.provider === "anthropic"
        ? createAutomationStudioAnthropicPanelCommandModel({ resolveKey, model: choice.model as AutomationStudioAnthropicModel, ...fetching })
        : createAutomationStudioDeepSeekPanelCommandModel({ resolveKey, model: choice.model as AutomationStudioDeepSeekModel, ...fetching });
      try {
        const answer = await model.decide(request, execution);
        options.ledger.note(choice.key, "answered");
        return answer;
      } catch (error) {
        if (releaseFailure !== undefined) throw new AutomationStudioModelAccessError(releaseAccess(releaseFailure, key), { cause: releaseFailure });
        const outcome = automationStudioModelAccessOutcomeOf(error);
        if (!outcome) throw error;
        const balance = (error as { code?: unknown }).code === "llm.provider_balance_exhausted";
        const message = outcome === "provider_unreachable" ? automationStudioModelAccessUnreachableMessage(choice.provider)
          : balance ? automationStudioModelAccessBalanceMessage(choice.provider) : automationStudioModelAccessRefusedMessage(choice.provider);
        const lastCall = options.ledger.note(choice.key, outcome, message);
        // Out of reach may pass; a refused key is refused again.
        throw new AutomationStudioModelAccessError({ status: outcome, message, key, lastCall }, { retryable: outcome === "provider_unreachable", cause: error });
      }
    }
  };
}

/** Why the chosen key could not be released for the sender, as their state. */
function releaseAccess(error: unknown, key: ModelAccessKey): ModelAccessState {
  const code = (error as { code?: unknown } | null)?.code;
  const unopenable = UNOPENABLE_CODES.find((candidate) => candidate === code);
  if (unopenable) return automationStudioModelAccessUnopenable(key, unopenable);
  const said = error instanceof Error ? error.message : "";
  // Turned off or removed between the choice and the release.
  if (/missing or turned off|no enabled .* key/iu.test(said)) return { status: "no_key", message: AUTOMATION_STUDIO_NO_MODEL_KEY_MESSAGE, key: null, lastCall: null };
  if (/permissions do not allow/iu.test(said)) return { status: "not_permitted", message: "Your permissions do not allow the saved model key to be used here, so ask an owner or administrator for the secrets:UseKey permission.", key, lastCall: null };
  return { status: "not_permitted", message: "The saved model key could not be released for this sign-in, so sign in to FluxIQ again and try again.", key, lastCall: null };
}
