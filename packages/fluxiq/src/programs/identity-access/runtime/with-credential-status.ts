import type { User, UserCredential } from "../types.ts";
import type { CredentialMetadata } from "./stored-state.ts";

/** The user as callers see it: whether a password and a PIN are configured, from the held credential or, while it is sealed, its metadata. */
export function withCredentialStatus(user: User, credential: UserCredential | undefined, metadata: CredentialMetadata | undefined): User {
  return {
    ...user,
    passwordConfigured: Boolean(credential?.passwordHash) || Boolean(metadata?.passwordConfigured),
    pinConfigured: Boolean(credential?.pinHash) || Boolean(metadata?.pinConfigured)
  };
}
