import type { SettingsPort } from "./types";

const COULD_NOT = "That key could not be replaced. Try again.";

/** Replaces a saved key's value in one call, with no password. The new value is sent and never kept. Answers "" when it worked, else the sentence to show. */
export async function replaceKey(port: SettingsPort, keyId: string, value: string): Promise<string> {
  const result = await port.call("secret-keys", "rotate-key", { id: keyId, value });
  return result.ok ? "" : result.error || COULD_NOT;
}
