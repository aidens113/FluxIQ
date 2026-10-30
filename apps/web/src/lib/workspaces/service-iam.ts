import type { FluxIQOptions } from "fluxiq";
import type { IamAuditSink, IamPolicySource, PlatformServices } from "fluxiq/platform";

/**
 * A workspace's IAM under the hosted `service` profile: the registry decides by
 * the policies attached in that workspace's IAM store and records each decision
 * in the platform's audit.
 *
 * The policy source is lazy: the instance is created synchronously, before the
 * platform services are open, so each decision asks `platformServices()` (one
 * shared composition) for `workspaceIam(workspaceId)` when it is made.
 */
export function serviceWorkspaceIam(workspaceId: string, deps: { platformServices: () => Promise<Pick<PlatformServices, "workspaceIam">>; audit: IamAuditSink }): NonNullable<FluxIQOptions["iam"]> {
  const store = async () => (await deps.platformServices()).workspaceIam(workspaceId);
  const source: IamPolicySource = {
    resolvePolicySet: async (principal, options) => await (await store()).resolvePolicySet(principal, options),
    getRole: async (name) => await (await store()).getRole(name)
  };
  return { profile: "service", workspaceId, source, audit: deps.audit };
}
