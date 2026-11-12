import type { AccountsOutcome, CredentialProof, InviteRequest } from "../model";
import { postAccounts } from "./post-accounts";

/** Invites a person (`POST /api/accounts/invite`) with the administrator's proof. The answer never carries the invite link. */
export function sendInvite(invite: InviteRequest, proof: CredentialProof): Promise<AccountsOutcome> {
  return postAccounts("/api/accounts/invite", { email: invite.email, displayName: invite.displayName, role: invite.role, proof });
}
