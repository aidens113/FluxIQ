// Which key each person's model call uses, read from Secret Keys for every call.
//
// The chat, a Flow call that names no provider, the model-access state and the
// panel assistant all choose through `chooseAutomationStudioCallerModelKey`, so
// they cannot disagree about which key is in use. Each person's own choice (the
// key they last saved, `personKeyId`) comes first; the workspace's Settings
// choice (`resolveAssistant`) serves them next when it is theirs, a legacy key,
// or another person's key both chosen for the workspace and offered by its
// holder; then their own newest model key. A person's save changes only their
// own choice, never anyone else's (t928, F1).

import { chooseAutomationStudioCallerModelKey, type AutomationStudioPreferredModelKey, type AutomationStudioSessionKeyPorts } from "../../../runtime/models/secrets/index.ts";
import type { AssistantModelChoice, SecretKeysService } from "../../secret-keys/index.ts";

/**
 * The choices the host's model paths read: the workspace's (`preferred`), a
 * person's own (`ownKeyId`), and what the panel assistant answers a person with
 * (`assistantKeyFor`), all ids and holders, never a value.
 */
export function callerModelKeyChoices(input: { keys: SecretKeysService; ports: AutomationStudioSessionKeyPorts }): {
  preferred(): Promise<AutomationStudioPreferredModelKey | undefined>;
  ownKeyId(userId: string): Promise<string | undefined>;
  assistantKeyFor(userId: string): Promise<AssistantModelChoice>;
} {
  const preferredOf = (choice: AssistantModelChoice): AutomationStudioPreferredModelKey | undefined =>
    choice.ok ? { keyId: choice.keyId, model: choice.model, ownerId: choice.ownerId, chosenForWorkspace: choice.chosenForWorkspace, offeredByHolder: choice.offeredByHolder } : undefined;
  const ownKeyId = (userId: string) => input.keys.modelKeys.personKeyId(userId);
  return {
    preferred: async () => preferredOf(await input.keys.modelKeys.resolveAssistant()),
    ownKeyId,
    // The workspace's choice as it stands whenever the person's call would use it, or none could serve them, so the
    // assistant's own words for a key it cannot use or may not lend still answer. Otherwise the key the person's calls
    // use, which is their own (or a legacy key nobody holds), released to their own principal: never lent, and with
    // the provider's normal model, since the workspace's model goes with the workspace's key.
    assistantKeyFor: async (userId) => {
      const workspace = await input.keys.modelKeys.resolveAssistant();
      const choice = chooseAutomationStudioCallerModelKey({ keys: (await input.ports.snapshot()).keys, userId, preferred: preferredOf(workspace), ownKeyId: await ownKeyId(userId) });
      if (!choice.ok || (workspace.ok && workspace.keyId === choice.key.id)) return workspace;
      const key = choice.key;
      return { ok: true, keyId: key.id, keyName: key.name ?? key.id, ...(key.provider ? { provider: key.provider } : {}), ...(key.createdBy ? { ownerId: key.createdBy } : {}), chosenForWorkspace: false, offeredByHolder: false };
    }
  };
}
