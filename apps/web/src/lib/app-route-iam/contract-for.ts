import { APP_ROUTE_IAM_CONTRACTS } from "./contracts";
import type { AppRouteIamContract, AppRouteMethod } from "./types";

/**
 * The IAM contract of one route and method (and, on a route that multiplexes,
 * its body's `action`). Throws for one that is not classified, so no route is
 * decided by a guess.
 */
export function appRouteIamContract(method: AppRouteMethod, path: string, variant?: string): AppRouteIamContract {
  const contract = APP_ROUTE_IAM_CONTRACTS.find((item) => item.method === method && item.path === path && item.variant === variant);
  if (!contract) throw new Error(`Unclassified app route: ${method} ${path}${variant === undefined ? "" : ` (${variant})`}`);
  return contract;
}
