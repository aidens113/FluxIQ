import { randomBytes } from "node:crypto";
import type { PanelEmailTemplate } from "@fluxiq/contracts/platform";
import { SerialQueue } from "../../store/rules/index.ts";
import type { PlatformProvisioningDeps, ProvisioningContext } from "./types.ts";

/** The default email-failure report: one line naming the template and the error's class, never its message, the address or the link. */
function warnEmailFailure(template: PanelEmailTemplate, error: unknown): void {
  const kind = error instanceof Error ? error.name : typeof error;
  console.warn(`FluxIQ provisioning: a ${template} email could not be sent (${kind}).`);
}

/**
 * Fills the defaults: no connected-client revocation (0), no workspace data
 * to delete, no `workspace.created` listener, no organisation entitlement,
 * the warning above, the system clock and `crypto.randomBytes`. The public
 * origin is reduced to its origin (`new URL(...).origin`), which throws for
 * anything that is not an absolute URL.
 */
export function createProvisioningContext(deps: PlatformProvisioningDeps): ProvisioningContext {
  const revokeConnectedClients = deps.revokeConnectedClients ?? (async () => 0);
  const deleteWorkspaceData = deps.deleteWorkspaceData ?? (async () => undefined);
  const onWorkspaceCreated = deps.onWorkspaceCreated ?? (async () => undefined);
  return {
    store: deps.store,
    identity: deps.identity,
    authorizer: deps.authorizer,
    auditSink: deps.auditSink,
    iamAttachments: (workspaceId) => deps.iamAttachments(workspaceId),
    email: deps.email,
    publicOrigin: new URL(deps.publicOrigin).origin,
    tenancy: deps.tenancy,
    revokeConnectedClients,
    deleteWorkspaceData,
    onWorkspaceCreated,
    organisationEntitled: deps.entitlements?.organisation ?? false,
    reportEmailFailure: deps.reportEmailFailure ?? warnEmailFailure,
    now: deps.now ?? Date.now,
    randomBytes: deps.randomBytes ?? ((size) => randomBytes(size)),
    queue: new SerialQueue()
  };
}
