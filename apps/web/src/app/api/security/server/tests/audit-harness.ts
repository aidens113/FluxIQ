import { GlobalProgramApiRegistry } from "fluxiq";
import { IAM_ADMINISTRATOR_ACCESS, IAM_OWNER_FULL_ACCESS, IAM_READ_ONLY_ACCESS, IAM_USER_ACCESS, MemoryIamAuditSink, type IamAuditQuery, type IamAuditRecord } from "fluxiq/platform";
import type { ActivitySource, AuditReader, AuditRouteDeps } from "../types";

// Test support for the audit route's handler: a memory audit that reads as the
// platform's compact store does (newest first, `since` inclusive, `until`
// exclusive, at most `limit`, a later write first within one second), a real registry that
// decides and records its own decision, and people of two workspaces. No
// secret is real: every value here is a dummy.

export const WORKSPACE = "ws-a";
export const OTHER_WORKSPACE = "ws-b";

const ADMIN_PERMISSIONS = ["programs.read", "programs.write", "flows.write", "runtime.control", "compute.control", "identity.manage", "data.manage", "secrets.manage"] as const;

/** A memory audit holding `records` in write order. */
export function memoryAudit(records: IamAuditRecord[]): AuditReader & { reads: IamAuditQuery[] } {
  const reads: IamAuditQuery[] = [];
  return {
    reads,
    read: async (query) => {
      reads.push(query);
      const since = query.since ?? Number.MIN_SAFE_INTEGER;
      const until = query.until ?? Number.MAX_SAFE_INTEGER;
      const ordered = records.map((record, index) => ({ record, index })).filter(({ record }) => record.time >= since && record.time < until);
      ordered.sort((left, right) => right.record.time - left.record.time || right.index - left.index);
      return ordered.slice(0, query.limit ?? 100).map(({ record }) => structuredClone(record));
    }
  };
}

/** One audit record, with every field a record can carry. */
export function record(fields: Partial<IamAuditRecord> & Pick<IamAuditRecord, "time" | "principal">): IamAuditRecord {
  return { category: "allow", requestId: "1", action: "studio:ListProjects", resources: [], decision: "allow", matched: "implicit", origin: "panel", ipPrefix: null, ...fields };
}

export const userFrn = (workspaceId: string, userId: string) => `frn:fluxiq:iam:${workspaceId}:user/${userId}`;

type Who = "admin" | "viewer";
type Policy = "administrator" | "owner" | "member" | "read-only";

const POLICIES = { administrator: IAM_ADMINISTRATOR_ACCESS, owner: IAM_OWNER_FULL_ACCESS, member: IAM_USER_ACCESS, "read-only": IAM_READ_ONLY_ACCESS } as const;

export type AuditHarness = {
  deps: AuditRouteDeps;
  /** The registry's own decision rows. */
  decisions: MemoryIamAuditSink;
  /** How many times the workspace and audit were resolved. */
  opened: () => number;
};

/**
 * The handler's dependencies as `who` on `local` (decided by `identity.manage`),
 * or holding `policy` on `service`; `audit` and `tenancy` stand for the
 * platform's, and `names` are the people of the caller's workspace.
 */
export function auditHarness(options: { who?: Who; policy?: Policy; audit: AuditReader; tenancy?: "single" | "multi"; names?: Readonly<Record<string, string>> }): AuditHarness {
  const decisions = new MemoryIamAuditSink();
  const policy = options.policy;
  const registry = policy === undefined
    ? new GlobalProgramApiRegistry({ iam: { workspaceId: WORKSPACE, audit: decisions } })
    : new GlobalProgramApiRegistry({
      iam: {
        profile: "service",
        workspaceId: WORKSPACE,
        audit: decisions,
        source: { resolvePolicySet: async () => ({ identity: [POLICIES[policy]], guardrails: [], sessions: [], boundary: null }), getRole: async () => null }
      }
    });
  const who = options.who ?? "admin";
  const permissions = who === "admin" || policy !== undefined ? [...ADMIN_PERMISSIONS] : ["programs.read" as const];
  let opened = 0;
  const source: ActivitySource = {
    workspaceId: WORKSPACE,
    tenancy: options.tenancy ?? "multi",
    audit: options.audit,
    nameOf: async (userId) => options.names?.[userId] ?? null
  };
  const deps: AuditRouteDeps = {
    actor: { sessionId: `session-${who}`, userId: `user-${who}`, roleId: who, permissions, channel: "panel" },
    authorizer: registry,
    activity: async () => {
      opened += 1;
      return source;
    }
  };
  return { deps, decisions, opened: () => opened };
}
