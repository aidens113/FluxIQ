export type OperationalRouteDisposition = "operator-ui" | "api-only" | "retired";
export type OperationalRouteContract = {
  id: string;
  method: "GET" | "POST";
  path: string;
  action?: string;
  disposition: OperationalRouteDisposition;
  permission: "programs.read" | "programs.write";
  owner: string;
  recovery: string;
};

export const OPERATIONAL_FRAMEWORK_ROUTES: readonly OperationalRouteContract[] = [
  { id: "framework.inspect", method: "GET", path: "/api/framework/setup", disposition: "api-only", permission: "programs.read", owner: "Framework host operator", recovery: "Read-only and safe to retry." },
  { id: "framework.setup", method: "POST", path: "/api/framework/setup", action: "setup", disposition: "api-only", permission: "programs.write", owner: "Framework host operator", recovery: "Idempotent setup; inspect state and retry after interruption." },
  { id: "framework.storage.migrate", method: "POST", path: "/api/framework/setup", action: "migrate", disposition: "api-only", permission: "programs.write", owner: "Framework host operator", recovery: "Preflight rejects divergent data before archive; inspect state before retry." },
  { id: "framework.storage.rollback", method: "POST", path: "/api/framework/setup", action: "rollback-migration", disposition: "api-only", permission: "programs.write", owner: "Framework host operator", recovery: "Restores the latest migration archive and reloads the runtime." },
  { id: "framework.io.inspect", method: "GET", path: "/api/framework/io", disposition: "api-only", permission: "programs.read", owner: "Importing repository integration", recovery: "Read-only and safe to retry." },
  { id: "framework.io.validate", method: "POST", path: "/api/framework/io/validate", disposition: "api-only", permission: "programs.read", owner: "Importing repository integration", recovery: "Validation has no side effects and is safe to retry." }
] as const;

export function operationalRouteContract(method: "GET" | "POST", path: string, action?: string): OperationalRouteContract {
  const normalizedAction = method === "POST" && path === "/api/framework/setup" ? action ?? "setup" : action;
  const contract = OPERATIONAL_FRAMEWORK_ROUTES.find((item) => item.method === method && item.path === path && item.action === normalizedAction);
  if (!contract) throw new Error(`Unclassified operational framework route: ${method} ${path}${normalizedAction ? ` (${normalizedAction})` : ""}`);
  return contract;
}

export function canUseOperationalRoute(permissions: readonly string[], contract: OperationalRouteContract): boolean {
  return permissions.includes(contract.permission);
}
