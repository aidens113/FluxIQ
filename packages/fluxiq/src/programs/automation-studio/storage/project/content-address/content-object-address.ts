// The keyed address of a sealed content-store object (t745 design note D2).
// The object's plaintext is addressed in the "content-object" domain with its
// stored media type (trimmed, lower case) as context, so equal bytes under two
// media types never share an address. Every writer, reader and the backfill
// use this one function, so they cannot drift apart.
import type { AutomationStudioContentAddressKeyring } from "./keyring.ts";

/** 64 lower hex: the address of `plaintext` under `keyId`, which the keyring must hold. */
export function automationStudioContentObjectAddress(keyring: AutomationStudioContentAddressKeyring, keyId: string, plaintext: Uint8Array, storedMediaType: string): string {
  return keyring.addressWith(keyId, "content-object", plaintext, storedMediaType.trim().toLowerCase()).toString("hex");
}
