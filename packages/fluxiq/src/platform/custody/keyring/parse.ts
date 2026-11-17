export type SecretKeyHostKeyring = { version: 1; currentKeyId: string; keys: Record<string, string> };

/** Dedicated host secret input, never a request or database record. */
export function parseSecretKeyHostKeyring(text: string): SecretKeyHostKeyring {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Invalid host keyring."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid host keyring.");
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || typeof row.currentKeyId !== "string" || !row.currentKeyId || !row.keys || typeof row.keys !== "object" || Array.isArray(row.keys)) throw new Error("Invalid host keyring.");
  const keys: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [id, key] of Object.entries(row.keys)) {
    if (!id || typeof key !== "string" || Buffer.from(key, "base64").length !== 32 || Buffer.from(key, "base64").toString("base64") !== key) throw new Error("Invalid host keyring.");
    keys[id] = key;
  }
  if (!Object.hasOwn(keys, row.currentKeyId)) throw new Error("Invalid current host key.");
  return { version: 1, currentKeyId: row.currentKeyId, keys };
}
