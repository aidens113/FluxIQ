/**
 * The operator programs whose endpoints are generated under the `ops` service
 * (Database Manager, Deployment Sync, Compute Control, root Docs, framework
 * setup and migrate). The contract names the panel programs; this list owns
 * the rest.
 */
export const IAM_OPERATOR_PROGRAMS: readonly string[] = Object.freeze([
  "database-manager",
  "background-tasks",
  "compute-control",
  "deployment-sync",
  "runtime",
  "docs",
  "production-runner"
]);
