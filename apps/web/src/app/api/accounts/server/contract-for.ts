import type { AppRouteIamContract, AppRouteMethod } from "../../../../lib/app-route-iam";
import { ACCOUNT_ROUTE_IAM_CONTRACTS } from "./iam-contracts";

/** The contract of one accounts route, method and variant. Throws for one that is not classified, so nothing is decided by a guess. */
export function accountRouteContract(method: AppRouteMethod, path: string, variant?: string): AppRouteIamContract {
  const contract = ACCOUNT_ROUTE_IAM_CONTRACTS.find((item) => item.method === method && item.path === path && item.variant === variant);
  if (!contract) throw new Error(`Unclassified accounts route: ${method} ${path}${variant === undefined ? "" : ` (${variant})`}`);
  return contract;
}
