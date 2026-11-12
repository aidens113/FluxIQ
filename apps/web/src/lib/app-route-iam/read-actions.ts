import { APP_ROUTE_IAM_CONTRACTS } from "./contracts";
import type { AppRouteIamContract } from "./types";

/**
 * The app route actions that only read: those whose every route and method
 * is a `GET`. What the decision audit drops when allowed; an action any
 * `POST` or `PUT` decides is kept. Sorted, each once.
 */
export function appRouteReadActions(contracts: readonly AppRouteIamContract[] = APP_ROUTE_IAM_CONTRACTS): string[] {
  const reads = new Set<string>();
  const writes = new Set<string>();
  for (const contract of contracts) {
    if (contract.method === "GET") reads.add(contract.action);
    else writes.add(contract.action);
  }
  return [...reads].filter((action) => !writes.has(action)).sort();
}
