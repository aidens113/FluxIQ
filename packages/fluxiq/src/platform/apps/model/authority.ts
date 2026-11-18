import type { AppGrant, AppInstallationV1, AppManifestV1, AppOperation } from "@fluxiq/contracts/apps";
import type { AppInstallProposal } from "./install-proposal.ts";

export type AppAuthorityActor = { userId: string; workspaceId: string; expiresAtMs: number };
export type AppPublicationActor = { userId: string; publisherId: string; expiresAtMs: number };
export type AppOperationActor = AppAuthorityActor & {
  delegation: { publisherId: string; appId: string; installationId: string; generation: number; origin: string; grants: AppGrant[] };
};

/** Trusted host ports must authenticate context and check current identity, membership and IAM.
 * Proposals are untrusted requested configuration, never authority. No port has an allow default.
 */
export interface AppRegistryAuthority {
  publication(context: unknown, manifest: AppManifestV1): Promise<AppPublicationActor | null>;
  installation(context: unknown, input: { manifest: AppManifestV1; proposal: AppInstallProposal; previous: AppInstallationV1 | null }): Promise<AppAuthorityActor | null>;
  revocation(context: unknown, installation: AppInstallationV1): Promise<AppAuthorityActor | null>;
  operation(context: unknown, input: { installation: AppInstallationV1; manifest: AppManifestV1; operation: AppOperation }): Promise<AppOperationActor | null>;
}
