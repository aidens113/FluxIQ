import type { IdentityAccessService } from "fluxiq";
import type { AccountReadStore } from "../../../../../lib/workspaces/account-reads";

/** Read-only assembly; no authorizer, credential proof, provisioning or mutation port. */
export type MemberListReadSource = {
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly tenancy: "single" | "multi";
  readonly profile: "local" | "self-hosted" | "service";
  readonly store: Readonly<AccountReadStore>;
  readonly identityAccess: Pick<IdentityAccessService, "snapshot">;
};
