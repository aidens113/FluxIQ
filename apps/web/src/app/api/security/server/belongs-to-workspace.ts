import type { IamAuditRecord } from "fluxiq/platform";
import { frnScope, type FrnScope } from "./frn-scope";

/** The principals that act for the platform itself, which have no FRN. */
const PLATFORM_ACTORS: ReadonlySet<string> = new Set(["platform-admin", "in-process"]);

function principalScope(principal: string): FrnScope {
  return PLATFORM_ACTORS.has(principal) ? { kind: "platform", type: principal, id: principal } : frnScope(principal);
}

/**
 * Whether an audit record is `workspaceId`'s to read. It fails closed:
 *
 * - a record naming any other workspace, or anything unreadable, is not;
 * - one by a person or role of this workspace is;
 * - one by the platform itself (a service identity, the platform
 *   administrator, FluxIQ in-process) is when it names this workspace, or
 *   under one workspace, where everything is that workspace's.
 */
export function belongsToWorkspace(record: Pick<IamAuditRecord, "principal" | "resources">, workspaceId: string, tenancy: "single" | "multi"): boolean {
  const resources = record.resources.map(frnScope);
  if (resources.some((scope) => scope.kind === "unknown" || (scope.kind === "workspace" && scope.workspaceId !== workspaceId))) return false;
  const principal = principalScope(record.principal);
  if (principal.kind === "workspace") return principal.workspaceId === workspaceId;
  if (principal.kind === "unknown") return false;
  return tenancy === "single" || resources.some((scope) => scope.kind === "workspace");
}
