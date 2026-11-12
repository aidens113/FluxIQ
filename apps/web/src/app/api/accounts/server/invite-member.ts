import { randomUUID } from "node:crypto";
import { ACCOUNT_ROLES } from "../../../../features/accounts/model";
import type { AccountRouteDeps } from "./route-deps";
import { accountRouteContract } from "./contract-for";
import type { AccountsResponse } from "./accounts-response";
import { assignableRoles } from "./assignable-roles";
import { authorizeAccountRoute } from "./authorize-account-route";
import { provisioningRefusal } from "./provisioning-refusal";
import { recheckProof } from "./recheck-proof";
import { refuseAccounts } from "./refuse-accounts";

/**
 * `POST /api/accounts/invite` `{email, displayName, role, proof}`: an
 * administrator invites a person into their workspace. Decided by IAM
 * (`iam:InviteMember`), then the caller re-proves their credentials (an
 * account is durable authority), then `platform.provisioning.createAccount`
 * runs as an in-process caller with the role's one predefined policy and
 * `sendWelcome`, so the person gets the welcome link by email and sets their
 * own password. No password is ever set here, and the link's token is never
 * returned: it reaches only the person's inbox.
 */
export async function inviteMember(deps: AccountRouteDeps, body: Record<string, unknown>): Promise<AccountsResponse> {
  const refusal = await authorizeAccountRoute(deps, accountRouteContract("POST", "/api/accounts/invite"));
  if (refusal) return refusal;
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const role = assignableRoles(deps.profile).find((candidate) => candidate === body.role);
  if (!email || !displayName) return refuseAccounts(400, "invalid_input", "Give the person's email and name.");
  if (role === undefined) return refuseAccounts(400, "invalid_input", "Choose a role this workspace offers.");
  const unproved = await recheckProof(deps, body.proof);
  if (unproved) return unproved;
  const platform = await deps.platform();
  const answer = await platform.provisioning.run(
    "createAccount",
    { requestId: `panel-invite-${randomUUID()}`, email, displayName, policies: [ACCOUNT_ROLES[role].policy as string], workspace: platform.workspaceId, sendWelcome: true },
    { kind: "in-process", actorUserId: deps.actor.userId, transport: "in-process" }
  );
  if (!answer.ok) return provisioningRefusal(answer.error.code);
  if (answer.result.status !== "created") return provisioningRefusal("email_taken");
  return { status: 200, body: { ok: true, payload: { userId: answer.result.userId } } };
}
