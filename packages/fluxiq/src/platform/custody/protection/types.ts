/** Authenticated context for one encrypted record's decryption key. */
export type SecretKeyProtectionContext = { storeId: string; ownerUserId: string; recordId: string; sealDigest: string };

/** Ciphertext only; the wrapping key remains with the host's resolver. */
export type SecretKeyProtectedDataKey = { version: 1; providerId: string; keyId: string; ciphertext: string; iv: string; tag: string };

export interface SecretKeyHostProtection {
  seal(input: { context: SecretKeyProtectionContext; dataKey: Uint8Array }): Promise<SecretKeyProtectedDataKey>;
  /** The caller owns and zeroes the returned buffer. */
  open(input: { context: SecretKeyProtectionContext; sealed: SecretKeyProtectedDataKey }): Promise<Buffer>;
}

export type SecretKeyHostProtectionKeyResolver = (input: { storeId: string; keyId?: string }) => { keyId: string; key: Uint8Array } | undefined | Promise<{ keyId: string; key: Uint8Array } | undefined>;
