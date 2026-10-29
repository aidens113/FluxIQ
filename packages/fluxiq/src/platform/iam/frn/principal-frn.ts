import { formatFluxIQResourceName, type IamPrincipalType } from "@fluxiq/contracts/iam";

/**
 * The FRN of a principal, `frn:fluxiq:iam:<workspaceId>:<type>/<id>`, or
 * `frn:fluxiq:iam::service-identity/<id>` for a platform-level service
 * identity (`workspaceId` null). Throws a `TypeError` for a name the FRN
 * grammar refuses, which includes a user, group or role with no workspace.
 */
export function iamPrincipalFrn(type: IamPrincipalType, workspaceId: string | null, id: string): string {
  return formatFluxIQResourceName({ service: "iam", workspaceId, resourceType: type, resourceId: id });
}
