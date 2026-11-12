import type { AccountRole } from "./types";

/**
 * Each role's words and the one predefined policy it is (hosted production
 * plan, Permissions, "Predefined policies"). `owner` and `other` are shown,
 * never given: the owner is claimed at setup, and `other` names policies this
 * screen does not know.
 */
export const ACCOUNT_ROLES: Readonly<Record<AccountRole, { label: string; summary: string; policy: string | null }>> = Object.freeze({
  owner: { label: "Owner", summary: "Everything, including people and settings.", policy: "FluxIQOwnerFullAccess" },
  administrator: { label: "Administrator", summary: "Everything in the workspace, including people.", policy: "FluxIQAdministratorAccess" },
  "read-only": { label: "Read only", summary: "Can look at everything and change nothing.", policy: "FluxIQReadOnlyAccess" },
  member: { label: "Member", summary: "Works with their own projects, keys and browsers only.", policy: "FluxIQUserAccess" },
  other: { label: "Custom access", summary: "Access set outside this screen.", policy: null }
});
