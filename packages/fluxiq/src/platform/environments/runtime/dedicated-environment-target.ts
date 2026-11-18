import type { CommerceExecutionTarget } from "../../commerce/index.ts";
import { DEDICATED_ENVIRONMENT_CAPABILITY } from "./dedicated-environment-capability.ts";

/**
 * The commerce target the server's IAM resolver answers for a dedicated
 * environment, once it has established that the account and workspace own it:
 * a dedicated managed-cloud target whose `targetId` is the `environmentId`, so
 * the admission matches it against the grant's `resourceIds`.
 */
export function dedicatedEnvironmentTarget(owner: { environmentId: string; accountId: string; workspaceId: string }, region: string, capabilities: readonly string[] = [DEDICATED_ENVIRONMENT_CAPABILITY]): CommerceExecutionTarget {
  return {
    kind: "managed-cloud",
    allocation: "dedicated",
    region,
    targetId: owner.environmentId,
    ownerAccountId: owner.accountId,
    ownerWorkspaceId: owner.workspaceId,
    capabilities: [...capabilities]
  };
}
