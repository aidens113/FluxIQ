import type { IdentityAccessService } from "fluxiq";
import type { CredentialSetupGrant } from "./credential-setup-grants";
import { TEMPORARY_CREDENTIAL } from "./temporary-credential";

/** `replaced`: the account now has the new password. `already_replaced`: the temporary credential no longer signs this account in. */
export type TemporaryCredentialReplacement = "replaced" | "already_replaced";

type ReplacementIdentity = Pick<IdentityAccessService, "authenticate" | "setPasswordAuthorized" | "revokeSession">;

/**
 * Replaces the temporary password of the grant's account as the account's own
 * password change. The temporary credential is proved again here, so a grant
 * that outlived it changes nothing; the change runs through identity access's
 * credential-change port with it as the current password, so sealed keys
 * follow; and the proof's session is revoked whatever happens, so it never
 * leaves the server. A refusal of the new password is thrown with identity
 * access's message.
 */
export async function replaceTemporaryCredential(identity: ReplacementIdentity, grant: CredentialSetupGrant, password: string): Promise<TemporaryCredentialReplacement> {
  let proof: Awaited<ReturnType<ReplacementIdentity["authenticate"]>>;
  try {
    proof = await identity.authenticate({ username: grant.username, password: TEMPORARY_CREDENTIAL.password });
  } catch {
    return "already_replaced";
  }
  try {
    if (proof.user.id !== grant.userId) return "already_replaced";
    await identity.setPasswordAuthorized({
      userId: grant.userId,
      password,
      sessionId: proof.session.id,
      authorizationPassword: TEMPORARY_CREDENTIAL.password,
      authorizationPin: undefined,
      authorizationTotp: undefined
    });
    return "replaced";
  } finally {
    await identity.revokeSession(proof.session.id);
  }
}
