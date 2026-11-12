import { asRecord, numberOf, textOf } from "../../home/model";
import { ACCOUNT_ROLES } from "./account-roles";
import type { AccountRole, AssignableRole, MemberRow, MemberSource, MemberState, MembersView, WorkspaceKind } from "./types";

const ROLES = new Set<string>(Object.keys(ACCOUNT_ROLES));
const ASSIGNABLE = new Set<string>(["administrator", "read-only", "member"]);
const STATES = new Set<string>(["active", "turned-off", "invited"]);
const KINDS = new Set<string>(["single", "personal", "organisation"]);

function shapeMember(raw: unknown): MemberRow[] {
  const record = asRecord(raw);
  const userId = textOf(record?.userId);
  if (!record || !userId) return [];
  const role = typeof record.role === "string" && ROLES.has(record.role) ? (record.role as AccountRole) : "other";
  const state = typeof record.state === "string" && STATES.has(record.state) ? (record.state as MemberState) : "active";
  const source: MemberSource = record.source === "identity" ? "identity" : "account";
  return [{
    userId,
    name: textOf(record.name) ?? textOf(record.email) ?? userId,
    email: textOf(record.email) ?? "",
    role,
    state,
    source,
    self: record.self === true,
    invitedAt: numberOf(record.invitedAt) ?? null,
    lastSignInAt: numberOf(record.lastSignInAt) ?? null
  }];
}

/**
 * The members view from `GET /api/accounts/members`, read defensively: each
 * field is built by name, so nothing the answer carries beyond them reaches
 * the screen.
 */
export function shapeMembersView(payload: unknown): MembersView {
  const root = asRecord(payload);
  const kind = typeof root?.workspaceKind === "string" && KINDS.has(root.workspaceKind) ? (root.workspaceKind as WorkspaceKind) : "single";
  const assignableRoles = (Array.isArray(root?.assignableRoles) ? root.assignableRoles : []).flatMap((role) => (typeof role === "string" && ASSIGNABLE.has(role) ? [role as AssignableRole] : []));
  return {
    workspaceKind: kind,
    assignableRoles,
    canRemove: root?.canRemove === true,
    members: (Array.isArray(root?.members) ? root.members : []).flatMap(shapeMember)
  };
}
