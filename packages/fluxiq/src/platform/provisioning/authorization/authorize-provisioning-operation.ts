import { IAM_PLATFORM_ADMIN_PRINCIPAL } from "@fluxiq/contracts/iam";
import { iamIpPrefix, iamPrincipalFrn } from "../../iam/index.ts";
import type { IamMatchedStatement, IamPrincipal, IamRequestContext } from "../../iam/index.ts";
import type { ProvisioningContext, ProvisioningGrant } from "../context/index.ts";
import type { PlatformProvisioningCaller } from "../types.ts";
import { provisioningAccountFrn } from "./account-frn.ts";
import { userPrincipalFrn } from "./user-principal-frn.ts";

/** The outcome of authorising one operation: allowed with the grant its IAM changes cite, or denied. */
export type ProvisioningAuthorization = { allowed: true; grant: ProvisioningGrant } | { allowed: false };

/**
 * Authorises and audits one operation as exactly one IAM decision on the
 * account's FRN, with no workspace in the context.
 *
 * - `service-identity`: decided by the IAM authorizer, which records the row;
 * - `platform-admin` and `in-process`: allowed, recorded here as an allow
 *   citing `{ policy: "platform-admin" | "in-process", sid: null }`.
 */
export async function authorizeProvisioningOperation(
  context: ProvisioningContext,
  caller: PlatformProvisioningCaller,
  action: string,
  accountId: string,
  requestId: string
): Promise<ProvisioningAuthorization> {
  const resource = provisioningAccountFrn(accountId);
  const nowMs = context.now();
  if (caller.kind === "service-identity") {
    const principal: IamPrincipal = { type: "service-identity", id: caller.name, workspaceId: null, frn: iamPrincipalFrn("service-identity", null, caller.name) };
    const request: IamRequestContext = { workspaceId: null, origin: "provisioning", currentTimeMs: nowMs, requestId };
    if (caller.sourceIp !== undefined) request.sourceIp = caller.sourceIp;
    const decision = await context.authorizer.authorize(principal, action, [{ frn: resource }], request);
    if (decision.decision !== "allow" || decision.matched === "implicit") return { allowed: false };
    const ipPrefix = iamIpPrefix(caller.sourceIp);
    return { allowed: true, grant: { actor: principal.frn, origin: "provisioning", requestId, ipPrefix, matched: decision.matched } };
  }
  const matched: IamMatchedStatement = { policy: caller.kind, sid: null };
  const actor = caller.kind === "platform-admin" ? IAM_PLATFORM_ADMIN_PRINCIPAL : await inProcessActor(context, caller.actorUserId);
  const origin = caller.kind === "platform-admin" ? "cli" : "provisioning";
  context.auditSink.record({
    category: "allow",
    time: Math.floor(nowMs / 1000),
    requestId,
    principal: actor,
    action,
    resources: [resource],
    decision: "allow",
    matched,
    origin,
    ipPrefix: null
  });
  return { allowed: true, grant: { actor, origin, requestId, ipPrefix: null, matched } };
}

/** The acting user's principal FRN (see `userPrincipalFrn`); with no acting user, or one with no workspace, `in-process`. */
async function inProcessActor(context: ProvisioningContext, actorUserId: string | null): Promise<string> {
  if (actorUserId === null) return "in-process";
  return (await userPrincipalFrn(context, actorUserId)) ?? "in-process";
}
