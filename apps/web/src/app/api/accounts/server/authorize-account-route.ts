import { authorizeAppRoute, type AppRouteIamContract, type AppRouteResourceInput } from "../../../../lib/app-route-iam";
import type { AccountRouteDeps } from "./route-deps";
import type { AccountsResponse } from "./accounts-response";
import { refuseAccounts } from "./refuse-accounts";

/**
 * Decides one accounts call through the registry, as every app route is
 * decided (and audited): null when allowed, else the refusal in the routes'
 * own shape (401, or 403 with the registry's sentence), coded `forbidden` so
 * the panel reads it as "no access".
 */
export async function authorizeAccountRoute(deps: AccountRouteDeps, contract: AppRouteIamContract, input: AppRouteResourceInput = {}): Promise<AccountsResponse | null> {
  const refusal = await authorizeAppRoute(deps.authorizer, contract, "panel", deps.actor, input);
  if (refusal === null) return null;
  return refusal.status === 401 ? refuseAccounts(401, "unauthenticated", refusal.error) : refuseAccounts(403, "forbidden", refusal.error);
}
