// Barrel for the `/api/security` routes' server logic: the read of the
// workspace's activity (the IAM audit), its tenancy scope, its field
// allow-list, its cursor and its per-request dependencies. The `route.ts`
// files are Next entry points and stay thin.
export { auditRouteDepsForRequest } from "./deps-for-request";
export { authorizeAuditRoute } from "./authorize-audit-route";
export { belongsToWorkspace } from "./belongs-to-workspace";
export { formatCursor } from "./format-cursor";
export { frnScope } from "./frn-scope";
export type { FrnScope } from "./frn-scope";
export { parseCursor } from "./parse-cursor";
export { platformAuditReader } from "./platform-audit-reader";
export { readActivity } from "./read-activity";
export { shapeActivityEntry } from "./shape-activity-entry";
export type { ActivityCursor, ActivitySource, AuditReader, AuditRouteDeps } from "./types";
