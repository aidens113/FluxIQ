import { randomUUID } from "node:crypto";
import type { PlatformProvisioningCaller } from "fluxiq/platform";
import { ACCOUNT_ROLES, roleOfPolicies, type MemberChangeAction } from "../../../../features/accounts/model";
import type { AccountPlatform, AccountRouteDeps } from "./route-deps";
import { accountRouteContract } from "./contract-for";
import type { AccountsResponse } from "./accounts-response";
import { assignableRoles } from "./assignable-roles";
import { authorizeAccountRoute } from "./authorize-account-route";
import { belongsElsewhere } from "./belongs-elsewhere";
import { isPendingInvite } from "./is-pending-invite";
import { provisioningRefusal } from "./provisioning-refusal";
import { recheckProof } from "./recheck-proof";
import { refuseAccounts } from "./refuse-accounts";
import { revokeInvite } from "./revoke-invite";
import { throttleResend } from "./throttle-resend";

const ACTIONS: readonly MemberChangeAction[] = ["set-role", "turn-off", "turn-on", "remove", "resend-invite", "revoke-invite"];

/** Under several workspaces, the changes that also find a suspended membership here: it can be turned back on, removed, or turned off again (nothing to do). */
const REACH_SUSPENDED: ReadonlySet<MemberChangeAction> = new Set(["turn-off", "turn-on", "remove"]);

/** Resending a link moves no authority; every other change does, so it re-proves the caller first. */
const WITHOUT_PROOF: ReadonlySet<MemberChangeAction> = new Set(["resend-invite"]);

const DONE: AccountsResponse = { status: 200, body: { ok: true } };

/**
 * `POST /api/accounts/member` `{action, userId, role?, proof?}`: one change
 * to one person in the caller's workspace, through provisioning as an
 * in-process caller. In order, and each refusal stops it:
 *
 * 1. the action is one of `ACTIONS`;
 * 2. IAM decides the action on that person's user (and audits it);
 * 3. the caller's own access is not changed here (a person cannot raise or
 *    end their own access from this screen, whatever a policy says);
 * 4. the person has an account and a membership in this workspace, active
 *    (or, with several workspaces, suspended, for `REACH_SUSPENDED`); an
 *    owner's access is not changed here (the owner is claimed at setup);
 * 5. the caller re-proves their credentials, except to resend an invite,
 *    which is rate limited instead (`throttleResend`, by administrator and
 *    person);
 * 6. the provisioning operation, whose own refusals (the last administrator,
 *    a policy it never attaches) are passed on by code.
 *
 * With one workspace the account is the membership: turning off and on is
 * the account's sign-in, `remove` deletes the account, and cancelling an
 * invite is `revokeInvite`, which never deletes an account taken up
 * meanwhile. With several, every change is to the membership here alone and
 * the person's account and other workspaces are untouched: turning off
 * suspends it, turning on resumes it, removing ends it. An invite is resent,
 * or cancelled by deleting its account, only when the account exists for this
 * workspace alone (`belongsElsewhere`); a pending invite of a person who is
 * also elsewhere is cancelled by removing the membership here. Resending and
 * revoking apply only to a pending invite.
 */
export async function changeMember(deps: AccountRouteDeps, body: Record<string, unknown>): Promise<AccountsResponse> {
  const action = ACTIONS.find((candidate) => candidate === body.action);
  if (action === undefined) return refuseAccounts(400, "invalid_input", "Unknown change.");
  const userId = typeof body.userId === "string" ? body.userId : "";
  const refusal = await authorizeAccountRoute(deps, accountRouteContract("POST", "/api/accounts/member", action), { userId });
  if (refusal) return refusal;
  if (!userId) return refuseAccounts(400, "invalid_input", "Choose a person.");
  if (userId === deps.actor.userId) return refuseAccounts(403, "self", "You cannot change your own access here.");
  const platform = await deps.platform();
  const several = platform.tenancy !== "single";
  const account = await platform.store.getAccount(userId);
  const membership = account === null || account.status === "deleted" ? null : await platform.store.getMembership(platform.workspaceId, userId);
  const reachable = membership !== null && (membership.status === "active" || (several && membership.status === "suspended" && REACH_SUSPENDED.has(action)));
  if (account === null || membership === null || !reachable) return provisioningRefusal("not_found");
  if (roleOfPolicies(membership.policies) === "owner") return refuseAccounts(403, "owner", "The owner's access is changed only by whoever runs this FluxIQ.");

  const role = assignableRoles(deps.profile).find((candidate) => candidate === body.role);
  if (action === "set-role" && role === undefined) return refuseAccounts(400, "invalid_input", "Choose a role this workspace offers.");
  let shared = false;
  if (action === "resend-invite" || action === "revoke-invite") {
    const user = (await deps.identityAccess.snapshot()).users.find((candidate) => candidate.id === userId);
    shared = several && await belongsElsewhere(platform, userId);
    // A person who is also in another workspace redeemed their welcome there: there is no invite of theirs to resend.
    if (!isPendingInvite(account, user) || (action === "resend-invite" && shared)) return refuseAccounts(409, "not_invited", "This person has already accepted their invite.");
  }
  if (!WITHOUT_PROOF.has(action)) {
    const unproved = await recheckProof(deps, body.proof);
    if (unproved) return unproved;
  }
  if (action === "resend-invite") {
    const throttled = throttleResend(deps.actor.userId, userId);
    if (throttled) return throttled;
  }
  // Turning off a suspended membership, or on an active one, is already done.
  if (several && ((action === "turn-off" && membership.status === "suspended") || (action === "turn-on" && membership.status === "active"))) return DONE;

  const caller: PlatformProvisioningCaller = { kind: "in-process", actorUserId: deps.actor.userId, transport: "in-process" };
  const requestId = `panel-${action}-${randomUUID()}`;
  if (action === "revoke-invite" && !shared) return revokeInvite(deps, platform, userId, caller, requestId);
  const input = { requestId, userId, workspaceId: platform.workspaceId, policy: role === undefined ? null : ACCOUNT_ROLES[role].policy };
  const answer = several ? await runForMembership(platform, action, input, caller) : await runForAccount(platform, action, input, caller);
  return answer.ok ? DONE : provisioningRefusal(answer.code);
}

type RunInput = { requestId: string; userId: string; workspaceId: string; policy: string | null };
type RunAnswer = { ok: true } | { ok: false; code: string };

const REASON = "Changed by a workspace administrator in the panel.";

/** One workspace: the account is the membership. Runs the one provisioning operation an action is; answers its error code only. */
async function runForAccount(platform: AccountPlatform, action: MemberChangeAction, input: RunInput, caller: PlatformProvisioningCaller): Promise<RunAnswer> {
  const { requestId, userId } = input;
  const answer =
    action === "set-role" ? await platform.provisioning.run("setPolicies", { requestId, userId, workspaceId: input.workspaceId, policies: [input.policy as string] }, caller)
    : action === "turn-off" ? await platform.provisioning.run("disableAccount", { requestId, userId, reason: REASON }, caller)
    : action === "turn-on" ? await platform.provisioning.run("enableAccount", { requestId, userId, reason: REASON }, caller)
    : action === "resend-invite" ? await platform.provisioning.run("sendWelcome", { requestId, userId }, caller)
    : await platform.provisioning.run("deleteAccount", { requestId, userId, mode: "immediate" }, caller);
  return answer.ok ? { ok: true } : { ok: false, code: answer.error.code };
}

/** Several workspaces: every change is to the membership in this workspace alone. */
async function runForMembership(platform: AccountPlatform, action: MemberChangeAction, input: RunInput, caller: PlatformProvisioningCaller): Promise<RunAnswer> {
  const { requestId, userId, workspaceId } = input;
  const answer =
    action === "set-role" ? await platform.provisioning.run("setPolicies", { requestId, userId, workspaceId, policies: [input.policy as string] }, caller)
    : action === "turn-off" ? await platform.provisioning.run("suspendMember", { requestId, userId, workspaceId, reason: REASON }, caller)
    : action === "turn-on" ? await platform.provisioning.run("resumeMember", { requestId, userId, workspaceId, reason: REASON }, caller)
    : action === "resend-invite" ? await platform.provisioning.run("sendWelcome", { requestId, userId }, caller)
    : await platform.provisioning.run("removeMember", { requestId, userId, workspaceId }, caller);
  return answer.ok ? { ok: true } : { ok: false, code: answer.error.code };
}
