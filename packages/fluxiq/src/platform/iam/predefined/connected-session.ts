import { IAM_DESTRUCTIVE_ACTIONS } from "../catalog/index.ts";
import { iamActionListStatements } from "./action-list-statements.ts";
import { defineIamPredefinedPolicy } from "./define-predefined-policy.ts";
import { IAM_WORKSPACE_PATTERNS } from "./workspace-patterns.ts";

/**
 * `FluxIQBrowserSession` (session policy): the fixed scope of a connected
 * browser's credential. A session policy only narrows, so the browser reaches
 * the intersection of this and its user's identity policies (with
 * `FluxIQUserAccess`, its user's own Studio data and browsers).
 *
 * - `SessionScope`: `gateway:*` and `studio:*` (connect, Studio read, write
 *   and run) in the workspace. Not `secrets:*`, `iam:*`, `ops:*` or
 *   `platform:*`, which the browser therefore never reaches.
 * - `SessionNeverIdentityOrReveal`: an explicit `Deny` of `iam:*` and
 *   `secrets:RevealKey`. Redundant with the scope today, and kept so the rule
 *   survives a later widening of `SessionScope`, and so a refusal cites it.
 * - `SessionNeverDestructive<Service>`: an explicit `Deny` of every generated
 *   destructive action (`IAM_DESTRUCTIVE_ACTIONS`: endpoints classified
 *   `destructive` or `destructive-ungated`), whatever the user may do in the
 *   panel. It includes `studio:ExecuteClientAction` (open question in t788-E).
 * - Denies name `Resource: "*"`: a deny should not depend on where it lands.
 */
export const IAM_CONNECTED_SESSION = defineIamPredefinedPolicy("FluxIQBrowserSession", "v1", [
  { Sid: "SessionScope", Effect: "Allow", Action: ["gateway:*", "studio:*"], Resource: [IAM_WORKSPACE_PATTERNS.content, IAM_WORKSPACE_PATTERNS.workspace] },
  { Sid: "SessionNeverIdentityOrReveal", Effect: "Deny", Action: ["iam:*", "secrets:RevealKey"], Resource: "*" },
  ...iamActionListStatements("SessionNeverDestructive", "Deny", IAM_DESTRUCTIVE_ACTIONS, ["*"])
]);
