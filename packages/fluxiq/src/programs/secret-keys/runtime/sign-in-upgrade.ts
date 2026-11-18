import type { EncryptedSecretValueRecord, SecretKeyRecord } from "../types.ts";
import { SecretKeyAccessUnavailableError, type SecretKeyDataKeys } from "./access/index.ts";
import type { SecretKeyStore } from "./key-store.ts";

/**
 * After a sign-in's password opened a password-sealed (old-format) record: a
 * record nobody owns becomes the signing-in person's, since their password
 * sealed it, and the opened data key is wrapped with host protection for the
 * record's owner, so the server opens it from then on with no password. Only
 * over the exact seal that opened; a record another write changed meanwhile
 * is left for the next sign-in. With no host protection configured nothing
 * can be wrapped, so nothing is written. `key` stays the caller's to zero.
 * True when the record was written.
 */
export async function upgradeOpenedRecord(ports: { store: SecretKeyStore; dataKeys: SecretKeyDataKeys }, input: { recordId: string; openedSeal: EncryptedSecretValueRecord; key: Buffer; userId: string }): Promise<boolean> {
  if (!ports.dataKeys.configured) return false;
  const current = ports.store.get(input.recordId);
  if (!current || current.sealed !== input.openedSeal) return false;
  const owner = current.createdBy ?? input.userId;
  const claimed: SecretKeyRecord = current.createdBy ? current : { ...current, createdBy: owner };
  let next: SecretKeyRecord;
  try {
    next = await ports.dataKeys.protect(claimed, input.key, owner);
  } catch (error) {
    // Host protection unavailable: the owner is still recorded, and the key's availability says why it cannot be opened.
    if (!(error instanceof SecretKeyAccessUnavailableError) || error.code !== "host_protection_unavailable") throw error;
    next = claimed;
  }
  if (next === current) return false;
  try {
    return await ports.store.commit(next, current);
  } catch (error) {
    // A sign-in never fails on the upgrade; the next sign-in retries it. Only the name is logged: store errors can carry record data.
    console.warn(`Secret Keys could not upgrade a saved key at sign-in (${error instanceof Error ? error.name : "non_error"}).`);
    return false;
  }
}
