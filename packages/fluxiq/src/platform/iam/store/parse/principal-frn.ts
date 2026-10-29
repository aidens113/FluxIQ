import { IAM_PRINCIPAL_TYPES, parseFluxIQResourceName } from "@fluxiq/contracts/iam";
import { IamStoreError } from "../errors/index.ts";
import type { IamPrincipalRef } from "../context/index.ts";

/**
 * Parses a principal FRN (`user`, `group`, `role` or `service-identity`) that
 * belongs to `workspaceId`. Throws `invalid_principal`, or `workspace_mismatch`
 * for another workspace's principal.
 */
export function parsePrincipalFrn(frn: string, workspaceId: string | null): IamPrincipalRef {
  const parsed = parseFluxIQResourceName(frn);
  const type = IAM_PRINCIPAL_TYPES.find((candidate) => candidate === parsed?.resourceType);
  if (parsed === null || parsed.service !== "iam" || type === undefined || parsed.resourceId.includes("/")) {
    throw new IamStoreError("invalid_principal", `${frn} is not a user, group, role or service-identity FRN.`);
  }
  if (parsed.workspaceId !== workspaceId) {
    throw new IamStoreError("workspace_mismatch", `${frn} belongs to a different workspace than this store.`);
  }
  return { frn, type, id: parsed.resourceId };
}
