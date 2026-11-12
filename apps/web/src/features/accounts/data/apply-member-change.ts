import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import type { AccountsOutcome, CredentialProof, MemberChange, MemberSource } from "../model";
import { outcomeOfAnswer } from "./outcome-of-answer";
import { postAccounts } from "./post-accounts";

const IDENTITY_ROLE = { administrator: "admin", "read-only": "viewer" } as const;

/**
 * Applies one change to one person. A person with an account changes through
 * `POST /api/accounts/member` (provisioning), the one writer of their role and
 * sign-in: `update-user` refuses them by name
 * (`identity.authority_managed_by_provisioning`). A person added before
 * accounts (`identity`) changes through Identity Access's own `update-user`,
 * which re-proves the caller the same way; it offers only a role
 * (administrator or read only) and turning off or on, so anything else is
 * refused here.
 */
export async function applyMemberChange(source: MemberSource, change: MemberChange, proof: CredentialProof | undefined, identity: ProgramCommandTransport): Promise<AccountsOutcome> {
  if (source === "account") return postAccounts("/api/accounts/member", { ...change, ...(proof ? { proof } : {}) });
  const fields =
    change.action === "set-role" && change.role !== "member" ? { roleId: IDENTITY_ROLE[change.role] }
    : change.action === "turn-off" ? { enabled: false }
    : change.action === "turn-on" ? { enabled: true }
    : null;
  if (fields === null) return { kind: "refused", message: "This person was added before accounts, so only their role and sign-in can be changed." };
  const answer = await identity.post("update-user", {
    id: change.userId,
    ...fields,
    authorizationPassword: proof?.password ?? "",
    ...(proof?.pin ? { authorizationPin: proof.pin } : {}),
    ...(proof?.totp ? { authorizationTotp: proof.totp } : {})
  });
  return outcomeOfAnswer(answer.status ?? (answer.ok ? 200 : 500), answer);
}
