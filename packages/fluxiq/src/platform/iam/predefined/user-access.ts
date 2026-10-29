import { defineIamPredefinedPolicy } from "./define-predefined-policy.ts";
import { IAM_WORKSPACE_PATTERNS } from "./workspace-patterns.ts";

// The list endpoints across the workspace whose registration declares a
// `list` filter: the registry keeps only the items the caller may read, so
// allowing the call shows a user their own items and nothing else. Named one
// by one, never `List*`: an unfiltered list on the workspace (every client
// session, every recording) would show a user other users' data. A registry
// test fails when a declared filtered workspace list is missing here, and
// another when a user reaches any unfiltered one (programs/_shared/tests).
const FILTERED_WORKSPACE_LISTS: readonly string[] = ["studio:ListConversations", "studio:Projects", "secrets:Snapshot"];

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
 * - `WorkspaceCreate`: `Create*` of the same services on the workspace FRN,
 *   where a top-level create evaluates (the registry records the creator as
 *   the new resource's owner). A list inside a project evaluates on the
 *   project, under `OwnData`.
 * - `WorkspaceFilteredLists`: the workspace-wide list endpoints whose
 *   registration filters its items (`FILTERED_WORKSPACE_LISTS`), on the
 *   workspace FRN; the filter then shows only what `OwnData` allows. Nothing
 *   else is granted on the workspace FRN: an unfiltered list across the
 *   workspace, and an action on no specific resource, are denied.
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
    Sid: "WorkspaceCreate",
    Effect: "Allow",
    Action: ["studio:Create*", "secrets:Create*", "gateway:Create*"],
    Resource: IAM_WORKSPACE_PATTERNS.workspace
  },
  {
    Sid: "WorkspaceFilteredLists",
    Effect: "Allow",
    Action: [...FILTERED_WORKSPACE_LISTS],
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
