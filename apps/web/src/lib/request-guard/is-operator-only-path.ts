const OPERATOR_ONLY_PATHS = new Set([
  "/api/programs/deployment-sync/sync",
  "/api/programs/deployment-sync/rollback",
  "/api/programs/database-manager/run-migration"
]);

/** True for the endpoints that run with no credential recheck and are command-line only on a public server. */
export function isOperatorOnlyPath(pathname: string): boolean {
  return OPERATOR_ONLY_PATHS.has(pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname);
}
