import type { HeldRevealAuthorization, SecretRevealAuthorizationMetadata } from "../../held-keys.ts";

export function secretRevealAuthorizationMetadata(authorization: HeldRevealAuthorization): SecretRevealAuthorizationMetadata {
  return {
    authorizationId: authorization.authorizationId,
    keyId: authorization.keyId,
    keyUpdatedAtMs: authorization.keyUpdatedAtMs,
    expiresAtMs: authorization.expiresAtMs,
    remainingUses: 1
  };
}
