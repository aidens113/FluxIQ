import type { IamAuditQuery, IamAuditRecord } from "fluxiq/platform";
import type { AppRouteActor, AppRouteAuthorizer } from "../../../../lib/app-route-iam";

/** What reads the IAM audit: its `read`, newest first, and nothing that writes. */
export type AuditReader = { read(query: IamAuditQuery): Promise<IamAuditRecord[]> };

/** Where the next page starts: the `k`th record (counted from 1) of second `t` was the last one read. */
export type ActivityCursor = { t: number; k: number };

/**
 * What a read of the activity works with once IAM allowed it:
 *
 * - `workspaceId`: the caller's session's workspace, from the server, never
 *   from the request; every entry is scoped to it;
 * - `tenancy`: `single` (one workspace, so a platform-level actor's entry is
 *   this workspace's) or `multi`;
 * - `audit`: the platform's IAM audit, read only;
 * - `nameOf`: the name of a person with a membership in this workspace, else
 *   null, so no other workspace's people are named.
 */
export type ActivitySource = {
  workspaceId: string;
  tenancy: "single" | "multi";
  audit: AuditReader;
  nameOf(userId: string): Promise<string | null>;
};

/**
 * The audit route's dependencies, built per request (`auditRouteDepsForRequest`)
 * and passed whole so tests use the real registry over memory doubles. The
 * workspace and the audit are resolved only after the decision allowed the
 * call, so a refused caller never opens them.
 */
export type AuditRouteDeps = {
  actor: AppRouteActor;
  authorizer: AppRouteAuthorizer;
  activity(): Promise<ActivitySource>;
};
