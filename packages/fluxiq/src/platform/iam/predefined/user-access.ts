import { defineIamPredefinedPolicy } from "./define-predefined-policy.ts";
import { IAM_WORKSPACE_PATTERNS } from "./workspace-patterns.ts";

/**
 * `FluxIQUserAccess`: the own-data rule. What a user reaches is what they
 * own, plus creating and listing in the workspace, plus managing their own
 * credentials.
 *
 * - `OwnData`: `studio:*`, `secrets:*` and `gateway:*` on those services'
 *   resources in the workspace whose `fluxiq:ResourceOwner` is the caller.
 *   `StringEquals` fails on a missing key, so a resource with no recorded
 *   owner is never reached through this statement. Children (flows, runs,
 *   datasets) carry their project's owner; keys their creator; browsers their
 *   user (plan, Ownership).
 * - `WorkspaceCreateList`: `Create*` and `List*` of the same services on the
 *   workspace FRN, where a top-level create or list evaluates. A list
 *   endpoint then filters its items by each item's `Read` action, so listing
 *   shows only what `OwnData` allows. Nothing else is granted on the workspace
 *   FRN: an action on no specific resource (today, every non-`ops` action,
 *   whose catalog `resourceTypes` is `["*"]`) is denied until its
 *   registration declares the resource it acts on, rather than reading the
 *   whole workspace.
 * - `SelfService`: the `iam` actions that change only the caller's own
 *   credentials, on `user/${fluxiq:PrincipalId}`. Not `iam:CreateUser`,
 *   `iam:UpdateUser` (moves a role) or `iam:Snapshot` (every user). The plan
 *   also names browser management (covered by `OwnData` on the caller's own
 *   `gateway` browsers) and a deletion request, which has no action yet.
 * - No `ops:*`, `platform:*`: a user never reaches operator programs.
 */
export const IAM_USER_ACCESS = defineIamPredefinedPolicy("FluxIQUserAccess", "v1", [
  {
    Sid: "OwnData",
    Effect: "Allow",
    Action: ["studio:*", "secrets:*", "gateway:*"],
    Resource: ["frn:fluxiq:studio:${fluxiq:WorkspaceId}:*", "frn:fluxiq:secrets:${fluxiq:WorkspaceId}:*", "frn:fluxiq:gateway:${fluxiq:WorkspaceId}:*"],
    Condition: { StringEquals: { "fluxiq:ResourceOwner": "${fluxiq:PrincipalId}" } }
  },
  {
    Sid: "WorkspaceCreateList",
    Effect: "Allow",
    Action: ["studio:Create*", "studio:List*", "secrets:Create*", "secrets:List*", "gateway:Create*", "gateway:List*"],
    Resource: IAM_WORKSPACE_PATTERNS.workspace
  },
  {
    Sid: "SelfService",
    Effect: "Allow",
    Action: [
      "iam:SetPassword",
      "iam:SetPin",
      "iam:BeginTotp",
      "iam:ConfirmTotp",
      "iam:DisableTotp",
      "iam:CreateSession",
      "iam:RevokeSession",
      "iam:UnlockVault",
      "iam:LockVault"
    ],
    Resource: "frn:fluxiq:iam:${fluxiq:WorkspaceId}:user/${fluxiq:PrincipalId}"
  }
]);
