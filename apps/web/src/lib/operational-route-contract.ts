import { appRouteIamContract, type AppRouteIamContract } from "./app-route-iam";

export type OperationalRouteDisposition = "operator-ui" | "api-only" | "retired";

/**
 * One framework operation: what it is for and how to recover from it, and
 * `iam`, its entry in the app route IAM table (action, permission, resources),
 * which is what the route decides by. `action` is the setup body's `action`.
 */
export type OperationalRouteContract = {
  id: string;
  method: "GET" | "POST";
  path: string;
  action?: string;
  disposition: OperationalRouteDisposition;
  owner: string;
  recovery: string;
  iam: AppRouteIamContract;
};

type OperationalRouteDescription = Omit<OperationalRouteContract, "iam">;

const OPERATIONS: readonly OperationalRouteDescription[] = [
  { id: "framework.inspect", method: "GET", path: "/api/framework/setup", disposition: "api-only", owner: "Framework host operator", recovery: "Read-only and safe to retry." },
  { id: "framework.setup", method: "POST", path: "/api/framework/setup", action: "setup", disposition: "api-only", owner: "Framework host operator", recovery: "Idempotent setup; inspect state and retry after interruption." },
  { id: "framework.storage.migrate", method: "POST", path: "/api/framework/setup", action: "migrate", disposition: "api-only", owner: "Framework host operator", recovery: "Preflight rejects divergent data before archive; inspect state before retry." },
  { id: "framework.storage.rollback", method: "POST", path: "/api/framework/setup", action: "rollback-migration", disposition: "api-only", owner: "Framework host operator", recovery: "Restores the latest migration archive and reloads the runtime." },
  { id: "framework.io.inspect", method: "GET", path: "/api/framework/io", disposition: "api-only", owner: "Importing repository integration", recovery: "Read-only and safe to retry." },
  { id: "framework.io.validate", method: "POST", path: "/api/framework/io/validate", disposition: "api-only", owner: "Importing repository integration", recovery: "Validation has no side effects and is safe to retry." }
];

// Bound to the IAM table at load: an operation with no IAM entry fails the
// module, not a request.
export const OPERATIONAL_FRAMEWORK_ROUTES: readonly OperationalRouteContract[] = Object.freeze(
  OPERATIONS.map((operation) => ({ ...operation, iam: appRouteIamContract(operation.method, operation.path, operation.action) }))
);

export function operationalRouteContract(method: "GET" | "POST", path: string, action?: string): OperationalRouteContract {
  const normalizedAction = method === "POST" && path === "/api/framework/setup" ? action ?? "setup" : action;
  const contract = OPERATIONAL_FRAMEWORK_ROUTES.find((item) => item.method === method && item.path === path && item.action === normalizedAction);
  if (!contract) throw new Error(`Unclassified operational framework route: ${method} ${path}${normalizedAction ? ` (${normalizedAction})` : ""}`);
  return contract;
}
