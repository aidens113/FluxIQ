// Which key the chat window's model call uses: the sender's own, released to
// their unlocked session (`session-key.ts`). A person whose keys are locked is
// told so in the thread instead of their message being read with somebody
// else's credential.

import type { AutomationStudioConversationCaller } from "../../conversations/index.ts";
import { releaseAutomationStudioSessionDeepSeekKey, type AutomationStudioSessionKeyPorts } from "./session-key.ts";

export type AutomationStudioPanelCommandKeyPorts = AutomationStudioSessionKeyPorts;

/**
 * A `resolveKey` for `createAutomationStudioDeepSeekPanelCommandModel`: the
 * newest enabled DeepSeek LLM key, released to the caller's unlocked session.
 * Throws, in words a person can act on, when there is no caller, no such key,
 * or the session has not unlocked it.
 */
export function automationStudioPanelCommandKeyFromSecretKeys(ports: AutomationStudioPanelCommandKeyPorts): (caller: AutomationStudioConversationCaller | null) => Promise<string> {
  return async (caller) => {
    if (!caller) throw new Error("No signed-in person sent this message, so no model key can be released for it.");
    return await releaseAutomationStudioSessionDeepSeekKey(ports, caller);
  };
}
