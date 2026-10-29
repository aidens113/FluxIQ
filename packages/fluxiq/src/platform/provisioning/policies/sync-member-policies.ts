import { iamPrincipalFrn } from "../../iam/index.ts";
import type { IamChangeContext } from "../../iam/index.ts";
import type { ProvisioningContext, ProvisioningGrant } from "../context/index.ts";

/**
 * Makes the policies attached to a member's user principal in a workspace
 * exactly `policies`: attaches the missing ones, detaches the rest. Each
 * change is an `iam-change` audit row citing the grant's deciding statement.
 * An empty list detaches everything (removing a member).
 */
export async function syncMemberPolicies(context: ProvisioningContext, grant: ProvisioningGrant, workspaceId: string, userId: string, policies: readonly string[]): Promise<void> {
  const attachments = context.iamAttachments(workspaceId);
  const principalFrn = iamPrincipalFrn("user", workspaceId, userId);
  const change: IamChangeContext = { actor: grant.actor, origin: grant.origin, requestId: grant.requestId, ipPrefix: grant.ipPrefix, matched: grant.matched };
  const attached = await attachments.listAttachedPolicies(principalFrn);
  for (const name of attached) if (!policies.includes(name)) await attachments.detachPolicy(principalFrn, name, change);
  for (const name of policies) if (!attached.includes(name)) await attachments.attachPolicy(principalFrn, name, change);
}
