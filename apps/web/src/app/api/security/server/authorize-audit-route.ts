import { appRouteIamContract, authorizeAppRoute } from "../../../../lib/app-route-iam";
import { refuseAccounts, type AccountsResponse } from "../../accounts/server";
import type { AuditRouteDeps } from "./types";

/**
 * Decides a read of the activity through the registry, as every app route is
 * decided (and audited): `iam:ListAuditEvents` on the workspace, which needs
 * `identity.manage` on `local` and `self-hosted` and an owner's or
 * administrator's policy on `service`. Null when allowed, else the refusal:
 * 401, or 403 coded `forbidden` with the registry's sentence.
 */
export async function authorizeAuditRoute(deps: AuditRouteDeps): Promise<AccountsResponse | null> {
  const refusal = await authorizeAppRoute(deps.authorizer, appRouteIamContract("GET", "/api/security/audit"), "panel", deps.actor);
  if (refusal === null) return null;
  return refusal.status === 401 ? refuseAccounts(401, "unauthenticated", refusal.error) : refuseAccounts(403, "forbidden", refusal.error);
}
