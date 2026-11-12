import { roleOfPolicies } from "../../../features/accounts/model";
import type { AccountLinkResponse } from "./accountLinkResponse";
import { readJsonObject } from "./readJsonObject";
import type { WelcomeDescribeDeps, WelcomeDescription } from "./WelcomeDescription";
import { welcomeLinkDigest } from "./welcomeLinkDigest";

/** 32 bytes in base64url without padding, as provisioning issues them. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/u;

const INVALID: WelcomeDescription = { status: 400, body: { ok: false, code: "invalid_link" } };

/**
 * Says what a welcome link is for, without spending it: the account's email,
 * the role its membership holds and the workspace's kind, so the page can say
 * what the person is joining before they choose a password. An unknown, used,
 * expired or wrong-purpose link, and one whose account is gone, are all
 * `invalid_link`, as redeeming says; a disabled account is `disabled`. Only
 * the holder of the token learns anything, and the same request checks
 * (same-site, a small JSON body) as the submit run first.
 */
export async function describeWelcome(request: Request, deps: WelcomeDescribeDeps): Promise<WelcomeDescription> {
  const body = await readJsonObject(request);
  if ("status" in body) {
    const refused = body as AccountLinkResponse;
    return { status: refused.status, body: { ok: false, code: refused.body.ok ? "bad_request" : refused.body.code } };
  }
  if (typeof body.token !== "string" || !TOKEN_SHAPE.test(body.token)) return INVALID;
  const record = await deps.store.getLinkToken(welcomeLinkDigest(body.token));
  if (record === null || record.purpose !== "welcome" || record.usedAtMs !== null || record.expiresAtMs <= deps.now()) return INVALID;
  const account = await deps.store.getAccount(record.userId);
  if (account === null || account.status === "deleted") return INVALID;
  if (account.status === "disabled") return { status: 403, body: { ok: false, code: "disabled" } };
  const memberships = (await deps.store.listMembershipsOfUser(account.userId)).filter((membership) => membership.status === "active");
  memberships.sort((left, right) => left.createdAtMs - right.createdAtMs);
  const membership = memberships[0];
  const workspace = membership === undefined ? null : await deps.store.getWorkspace(membership.workspaceId);
  return {
    status: 200,
    body: { ok: true, invitation: { email: account.email, role: roleOfPolicies(membership?.policies ?? []), workspaceKind: workspace?.kind ?? "single" } }
  };
}
