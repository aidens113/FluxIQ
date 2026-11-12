import { APP_ROUTE_IAM_CONTRACTS, type AppRouteIamContract } from "../../../../lib/app-route-iam";

// The IAM contracts of the `/api/accounts` routes (W5 accounts): their rows of
// the one app route IAM table (`APP_ROUTE_IAM_CONTRACTS`), which says why each
// requires `identity.manage` of a panel caller and what each acts on. Kept as
// a view so the handlers look a contract up among their own routes only.

const ACCOUNTS_PREFIX = "/api/accounts/";

export const ACCOUNT_ROUTE_IAM_CONTRACTS: readonly AppRouteIamContract[] = Object.freeze(APP_ROUTE_IAM_CONTRACTS.filter((contract) => contract.path.startsWith(ACCOUNTS_PREFIX)));
