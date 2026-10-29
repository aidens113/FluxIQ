import { assertSegment } from "../assert/index.ts";
import type { IamPrincipalRef, IamStoreScope } from "../context/index.ts";
import { IamStoreError } from "../errors/index.ts";
import { parsePrincipalFrn } from "../parse/index.ts";

const LABELS = { group: "Group", role: "Role", "service-identity": "Service identity" } as const;

/** A principal FRN of this store; a group, role or service identity must exist (a user has no record here). */
export async function requirePrincipal(scope: IamStoreScope, frn: string): Promise<IamPrincipalRef> {
  const principal = parsePrincipalFrn(frn, scope.workspaceId);
  assertSegment(principal.id, "A principal id");
  if (principal.type === "group" || principal.type === "role" || principal.type === "service-identity") {
    if ((await scope.records.get(principal.type, principal.id)) === null) {
      throw new IamStoreError("not_found", `${LABELS[principal.type]} ${principal.id} does not exist.`);
    }
  }
  return principal;
}
