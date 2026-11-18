import { DEDICATED_ENVIRONMENT_CAPABILITY, dedicatedEnvironmentTarget } from "fluxiq/platform";
import type { CloudAdmissionOptions, CommerceExecutionAuthority } from "fluxiq/platform";
import type { HostedCloudAuthorizerDeps, HostedEnvironmentActor } from "./types";

type Authorize = CloudAdmissionOptions<unknown>["authorize"];

/**
 * The hosted service's IAM target resolver for dedicated environments, the
 * one `setCloudAuthorizer` installs. It answers an authority only when:
 *
 * - the actor is a panel request's held authority that still revalidates
 *   (signed in, the same session and workspace, its route's IAM allowed);
 * - the request is for that very workspace and the dedicated capability;
 * - the workspace has a paying account (a personal workspace's owner;
 *   organisations are billed by a later unit, so they answer none);
 * - the environment is new, or recorded under that account and workspace.
 *
 * The account always comes from FluxIQ's own records, never the request. Any
 * other request is not authorized (null); a store outage throws, so it can
 * never become an allowed admission.
 */
export function hostedCloudAuthorizer(deps: HostedCloudAuthorizerDeps): Authorize {
  return async (request) => {
    if (request.capability !== DEDICATED_ENVIRONMENT_CAPABILITY || !isActor(request.actor) || request.actor.workspaceId !== request.workspaceId) return null;
    const validation = await request.actor.revalidate();
    if (!validation.ok) return null;
    const binding = validation.caller.binding;
    if (binding.channel !== "panel" || binding.workspaceId !== request.workspaceId) return null;
    const workspace = await deps.workspaces.getWorkspace(request.workspaceId);
    const accountId = workspace?.workspaceId === request.workspaceId ? workspace.ownerUserId : null;
    if (accountId === null) return null;
    const record = await deps.environments.get(request.targetId);
    if (record !== null && (record.accountId !== accountId || record.workspaceId !== request.workspaceId)) return null;
    const owner = { environmentId: request.targetId, accountId, workspaceId: request.workspaceId };
    const authority: CommerceExecutionAuthority = {
      principalId: binding.userId,
      accountId,
      workspaceId: request.workspaceId,
      target: dedicatedEnvironmentTarget(owner, deps.region),
      cloudAuthorization: { accountId, workspaceId: request.workspaceId }
    };
    return authority;
  };
}

function isActor(value: unknown): value is HostedEnvironmentActor {
  return value !== null && typeof value === "object"
    && typeof (value as HostedEnvironmentActor).workspaceId === "string"
    && typeof (value as HostedEnvironmentActor).revalidate === "function";
}
