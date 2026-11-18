import type { SecretKeyCredentialHolder, SecretKeyCredentialUnlockRecord } from "../../types.ts";
import { newCredentialUnlockKeyPair, wrapCredentialUnlockPrivateKey } from "./crypto.ts";

/** Creates an independent credential envelope and wipes its private key after wrapping. */
export function createCredentialUnlockRecord(holder: SecretKeyCredentialHolder, credential: string, previous: SecretKeyCredentialUnlockRecord | undefined, options: { nowMs: number }): SecretKeyCredentialUnlockRecord {
  const pair = newCredentialUnlockKeyPair();
  try {
    const approvingSessionDigest = holder.approvingSessionDigest ?? previous?.approvingSessionDigest;
    const label = holder.label ?? previous?.label;
    const { nowMs } = options;
    return {
      recordType: "secret-key-credential-unlock",
      id: holder.holderId,
      holderId: holder.holderId,
      holderKind: holder.holderKind,
      userId: holder.userId,
      expiresAtMs: holder.expiresAtMs,
      publicKey: pair.publicKey,
      wrap: wrapCredentialUnlockPrivateKey(pair.privateKeyDer, credential, { holderId: holder.holderId, userId: holder.userId }),
      boxes: {},
      ...(approvingSessionDigest ? { approvingSessionDigest } : {}),
      ...(label ? { label } : {}),
      pairedAtMs: previous?.pairedAtMs ?? nowMs,
      lastUsedAtMs: nowMs,
      updatedAtMs: nowMs
    };
  } finally {
    pair.privateKeyDer.fill(0);
  }
}
