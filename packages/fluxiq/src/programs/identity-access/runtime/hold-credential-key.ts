import type { CredentialKey } from "./credential-seal.ts";

/** Holds a credential key for a user, zeroing the key it replaces. */
export function holdCredentialKey(keys: Map<string, CredentialKey>, userId: string, key: CredentialKey): void {
  const previous = keys.get(userId);
  if (previous && previous.key !== key.key) previous.key.fill(0);
  keys.set(userId, key);
}
