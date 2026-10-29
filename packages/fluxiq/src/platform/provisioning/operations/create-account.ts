import { randomUUID } from "node:crypto";
import type { PlatformAccountRecord } from "../../store/index.ts";
import { isWeakPassword, ProvisioningRefusal } from "../context/index.ts";
import type { ProvisioningContext } from "../context/index.ts";
import { mailAccountExists, mailWelcomeLink } from "../links/index.ts";
import { checkProvisioningPolicies, identityRoleForPolicies, syncMemberPolicies } from "../policies/index.ts";
import type { PlatformIdentityPort } from "../types.ts";
import { accountOrigin } from "./account-origin.ts";
import { resolveAccountWorkspace } from "./resolve-account-workspace.ts";
import type { ProvisioningOperation } from "./types.ts";

type UpsertUserParams = Parameters<PlatformIdentityPort["upsertUser"]>[0];

/**
 * `createAccount`. Checks come first and change nothing: the policies
 * (`forbidden_policy`), the password (`weak_password`), the workspace
 * (`not_found`, `entitlement_required`), then the email. An email that
 * already has an account is `{status: "exists"}` over HTTP, with an
 * "account-exists" email to the address, and `email_taken` in-process. An
 * externalId that already names another account is `invalid_input`.
 *
 * Then: the identity user (username = email, the interim role from the
 * policies, the password when given), the account row, a personal workspace
 * when `"new"` under multi tenancy (`onWorkspaceCreated` after its row), the
 * membership and its policy attachments, and with `sendWelcome` the welcome
 * link. The decision named the id minted here, which becomes the user id.
 */
export const createAccountOperation: ProvisioningOperation<"createAccount"> = {
  async target() {
    return randomUUID();
  },

  async execute(context, input, { caller, grant, accountId }) {
    const nowMs = context.now();
    const policies = checkProvisioningPolicies(input.policies, context.tenancy, caller.transport, nowMs);
    if (input.password !== undefined && isWeakPassword(input.password)) throw new ProvisioningRefusal("weak_password", "The password must be at least 12 characters.");
    const workspace = await resolveAccountWorkspace(context, input.workspace);
    const existing = await context.store.findAccountByEmail(input.email);
    if (existing !== null) {
      if (caller.transport !== "http") throw new ProvisioningRefusal("email_taken", "An account with this email already exists.");
      await mailAccountExists(context, existing.email);
      return { status: "exists" };
    }
    if (input.externalId !== undefined && (await context.store.findAccountByExternalId(input.externalId)) !== null) {
      throw new ProvisioningRefusal("invalid_input", "The externalId already names another account.", [{ path: "externalId", message: "Already names another account." }]);
    }

    const userId = accountId;
    const user: UpsertUserParams = { id: userId, username: input.email, displayName: input.displayName, roleId: identityRoleForPolicies(policies), enabled: true };
    if (input.password !== undefined) user.password = input.password;
    await context.identity.upsertUser(user);

    const account: PlatformAccountRecord = {
      userId,
      email: input.email,
      emailVerifiedAtMs: null,
      displayName: input.displayName,
      externalId: input.externalId ?? null,
      identities: [{ provider: "password", subject: input.email }],
      status: "active",
      disabledReason: null,
      createdVia: accountOrigin(caller),
      termsVersion: input.termsVersion ?? null,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      lastSignInAtMs: null,
      deletion: null
    };
    await context.store.putAccount(account);

    const workspaceId = await placeWorkspace(context, workspace.kind === "new-personal" ? null : workspace.workspaceId, userId, nowMs);
    await context.store.putMembership({ workspaceId, userId, policies, groups: [], status: "active", createdAtMs: nowMs, updatedAtMs: nowMs });
    await syncMemberPolicies(context, grant, workspaceId, userId, policies);
    if (input.sendWelcome === true) await mailWelcomeLink(context, account, input.continueUrl ?? null);
    return { status: "created", userId, workspaceId };
  }
};

/**
 * The workspace the account joins: a new personal workspace (row written,
 * then `onWorkspaceCreated`), or the existing one, whose row the single
 * tenancy's one workspace gets the first time it is used.
 */
async function placeWorkspace(context: ProvisioningContext, existingId: string | null, userId: string, nowMs: number): Promise<string> {
  if (existingId === null) {
    const workspaceId = randomUUID();
    await context.store.putWorkspace({ workspaceId, kind: "personal", ownerUserId: userId, createdAtMs: nowMs });
    await context.onWorkspaceCreated(workspaceId);
    return workspaceId;
  }
  if (context.tenancy.mode === "single" && (await context.store.getWorkspace(existingId)) === null) {
    await context.store.putWorkspace({ workspaceId: existingId, kind: "single", ownerUserId: null, createdAtMs: nowMs });
  }
  return existingId;
}
