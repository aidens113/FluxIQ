import type { ActivityEntry } from "./types";

/** Provisioning and bookkeeping the platform does for itself: not something a person did. */
const SYSTEM_ACTIONS = new Set([
  "iam:AssumeRole", "iam:MintPressGrant", "iam:AttachUserPolicy", "iam:DetachUserPolicy", "iam:CreateServiceIdentity", "iam:DeleteServiceIdentity",
  "iam:CreatePolicy", "iam:SetDefaultPolicyVersion", "iam:DeletePolicyVersion", "iam:UpdateAssumeRolePolicy", "iam:AddUserToGroup", "iam:RemoveUserFromGroup",
  "iam:CreateGroup", "iam:UnlockVault", "iam:LockVault", "iam:CreateSession", "platform:SetAccountPolicies", "platform:AddAccountMembership", "platform:AddMember"
]);

/** Looking things up (a page loading its lists) is not an act either. */
const LOOKUP = /^[a-z-]+:(List|Get|Read|Snapshot|Inspect)/u;

/** Whether an entry is system activity, which the page keeps behind "Show system activity". */
export function isSystemActivity(entry: ActivityEntry): boolean {
  return entry.who === "The platform administrator" || SYSTEM_ACTIONS.has(entry.action) || LOOKUP.test(entry.action);
}
