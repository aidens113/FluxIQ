import type { SettingsKey, SettingsModelChoices } from "./types";

/**
 * Whether the key the assistant uses pays for this person's messages:
 * - `none`: there is no model key;
 * - `yours`: it is their own key, which always pays for their own messages;
 * - `shared`: another person's key, chosen as the workspace's key and offered
 *   by its holder;
 * - `not-chosen`: another person's key nobody chose as the workspace's key;
 * - `not-offered`: chosen, but its holder has not offered it.
 * No key is shared automatically, so only `yours` and `shared` answer.
 */
export type WorkspaceKeyStatus = "none" | "yours" | "shared" | "not-chosen" | "not-offered";

/** The server's answer (`assistantKeyChosen`, `assistantKeyOffered`) read for the signed-in person (`heldByYou`). */
export function workspaceKeyStatus(keys: readonly SettingsKey[], choices: SettingsModelChoices): WorkspaceKeyStatus {
  const usedId = choices.assistantKeyId ?? choices.defaultKeyId;
  // With no stored choice the engine uses the first enabled model key.
  const used = usedId ? keys.find((key) => key.id === usedId) : keys.find((key) => key.kind === "llm" && key.enabled);
  if (!usedId && !used) return "none";
  if (used?.heldByYou === true) return "yours";
  if (choices.assistantKeyChosen !== true) return "not-chosen";
  if (choices.assistantKeyOffered !== true) return "not-offered";
  return "shared";
}
