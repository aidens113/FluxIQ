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
 * Keys, settings and making or managing projects are the panel's for every
 * client (user, 2026-11-27); a client shows the work and keeps its chat. So
 * the session holds the reads a client shows and the Studio work of its chat,
 * and nothing that configures (t1095).
 *
 * - `SessionScope`: `gateway:*` and `studio:*` (connect, Studio read, write
 *   and run) in the workspace. Not `ops:*` or `platform:*`, which the browser
 *   therefore never reaches; of `iam:*` only the next statement, and of
 *   `secrets:*` only model access.
 * - `SessionOwnPreferencesRead`: reading the session's own person's
 *   preferences (`iam:GetMyPreferences`: their starting humanness), on that
 *   person's own user and nowhere else, so a client starts a task at the pace
 *   its person chose in the panel. Whether it may is still the identity
 *   policies' decision (`FluxIQUserAccess`'s `SelfService`). Changing them
 *   (`iam:UpdateMyPreferences`) is the panel's.
 * - `SessionModelAccess`: model access, which a connected client always has
 *   (user, 2026-11-14 and 2026-11-16): reading the Secret Keys snapshot
 *   (`secrets:Snapshot`) in the workspace, which is how the browser shows
 *   whether its person's chats can reach a model (the paired route projects
 *   that answer to readiness alone, and the model-access push asks the same
 *   decision, so the two never disagree), and using a key for the person's own
 *   model calls (`secrets:UseKey`, which the key-use authority decides for a
 *   trusted client). Which keys stays the identity policies' decision
 *   (`FluxIQUserAccess`'s `OwnData` reaches only the person's own). Every key
 *   write, the person's own model key included (allowed t950 to t1095), is the
 *   panel's; `secrets:RevealKey` is denied.
 * - `SessionNeverIdentity`: an explicit `Deny` of `iam:*` on every resource
 *   but the session's own user. A `NotResource` that cannot be bound (a
 *   principal with no workspace) excludes nothing, so then it denies every
 *   identity action.
 * - `SessionOwnUserReadsPreferencesOnly`: an explicit `Deny` of every action
 *   but `iam:GetMyPreferences` on the session's own user: its credentials, its
 *   sessions and vault, its press grants, its other preferences, its sign-in
 *   name, its panel assistant and its own model key. With the deny before it,
 *   every identity action except that one read is refused by name, and the
 *   rule survives a later widening of `SessionScope`.
 * - `SessionNeverReveal`: an explicit `Deny` of `secrets:RevealKey`.
 * - `SessionNeverDestructive<Service>`: an explicit `Deny` of every generated
 *   destructive action (`IAM_DESTRUCTIVE_ACTIONS`: endpoints classified
 *   `destructive` or `destructive-ungated`), whatever the user may do in the
 *   panel. It includes `studio:ExecuteClientAction` (open question in t788-E).
 * - Denies name `Resource: "*"` unless they exist to except the person's own
 *   user: a deny should not depend on where it lands.
 */
export const IAM_CONNECTED_SESSION = defineIamPredefinedPolicy("FluxIQBrowserSession", "v2", [
  { Sid: "SessionScope", Effect: "Allow", Action: ["gateway:*", "studio:*"], Resource: [IAM_WORKSPACE_PATTERNS.content, IAM_WORKSPACE_PATTERNS.workspace] },
  { Sid: "SessionOwnPreferencesRead", Effect: "Allow", Action: ["iam:GetMyPreferences"], Resource: IAM_WORKSPACE_PATTERNS.ownUser },
  { Sid: "SessionModelAccess", Effect: "Allow", Action: ["secrets:Snapshot", "secrets:UseKey"], Resource: [IAM_WORKSPACE_PATTERNS.content, IAM_WORKSPACE_PATTERNS.workspace] },
  { Sid: "SessionNeverIdentity", Effect: "Deny", Action: ["iam:*"], NotResource: IAM_WORKSPACE_PATTERNS.ownUser },
  { Sid: "SessionOwnUserReadsPreferencesOnly", Effect: "Deny", NotAction: ["iam:GetMyPreferences"], Resource: IAM_WORKSPACE_PATTERNS.ownUser },
  { Sid: "SessionNeverReveal", Effect: "Deny", Action: ["secrets:RevealKey"], Resource: "*" },
  ...iamActionListStatements("SessionNeverDestructive", "Deny", IAM_DESTRUCTIVE_ACTIONS, ["*"])
]);
