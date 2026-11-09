// A private key the SDK can sign with, and what identifies it.

import type { KeyObject } from "node:crypto";

/**
 * - `privateKey`: the Ed25519 key, never printed or sent;
 * - `publicKeySpki`: its public half as SPKI DER;
 * - `keyId`: `fxk_...` (`fluxiqKeyId`);
 * - `source`: where it came from, in words, for messages (never the key itself).
 */
export type LoadedKey = {
  readonly privateKey: KeyObject;
  readonly publicKeySpki: Buffer;
  readonly keyId: string;
  readonly source: string;
};
