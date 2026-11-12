import type { FluxIQOptions } from "fluxiq";
import type { IamAuditSink, PlatformServices } from "fluxiq/platform";
import { serviceWorkspaceIam } from "./service-iam";
import type { WorkspaceTenancy } from "./tenancy-of-profile";

/**
 * A workspace instance's IAM options, on every profile. Under `multi` (the
 * hosted `service`) it is `serviceWorkspaceIam`, unchanged: policies from the
 * workspace's IAM store. Under `single` (`local`, `self-hosted`) decisions are
 * made as before, by the program runtime's own profile and the caller's
 * permissions, in the primary workspace; only the audit is added, so the
 * Activity log holds route decisions there too. `audit` is the
 * changes-and-refusals sink (`WorkspaceDecisionAudit.sink`).
 */
export function workspaceIam(tenancy: WorkspaceTenancy, workspaceId: string, deps: { platformServices: () => Promise<Pick<PlatformServices, "workspaceIam">>; audit: IamAuditSink }): NonNullable<FluxIQOptions["iam"]> {
  if (tenancy === "multi") return serviceWorkspaceIam(workspaceId, deps);
  return { workspaceId, audit: deps.audit };
}
