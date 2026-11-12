import { ACCOUNT_ROLES, type AccountRole, type WorkspaceKind } from "../../../features/accounts/model";

const AS: Readonly<Record<AccountRole, string | null>> = Object.freeze({
  owner: "its owner",
  administrator: "an administrator",
  "read-only": "a read-only member",
  member: "a member",
  other: null
});

/**
 * What the person is joining, in plain words: a workspace of their own, an
 * organisation's, or this FluxIQ's one workspace (named by its address), and
 * the role they get there with what it allows.
 */
export function invitationSentence(invitation: { role: AccountRole; workspaceKind: WorkspaceKind }, host: string): string {
  if (invitation.workspaceKind === "personal") return "You are setting up your own FluxIQ workspace.";
  const where = invitation.workspaceKind === "organisation" ? "an organisation's FluxIQ workspace" : host ? `the FluxIQ workspace at ${host}` : "this FluxIQ workspace";
  const as = AS[invitation.role];
  return as === null ? `You are joining ${where}.` : `You are joining ${where} as ${as}. ${ACCOUNT_ROLES[invitation.role].summary}`;
}
