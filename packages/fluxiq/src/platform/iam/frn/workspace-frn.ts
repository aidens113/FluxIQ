import { formatFluxIQResourceName } from "@fluxiq/contracts/iam";

/**
 * The FRN of a workspace, `frn:fluxiq:platform::workspace/<workspaceId>`: the
 * resource a top-level create or list acts on. Throws a `TypeError` for an id
 * the FRN grammar refuses.
 */
export function iamWorkspaceFrn(workspaceId: string): string {
  return formatFluxIQResourceName({ service: "platform", workspaceId: null, resourceType: "workspace", resourceId: workspaceId });
}
