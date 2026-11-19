import { IAM_DESTRUCTIVE_ACTIONS } from "../catalog/index.ts";
import { iamActionListStatements } from "./action-list-statements.ts";
import { defineIamPredefinedPolicy } from "./define-predefined-policy.ts";
import { IAM_OWN_MODEL_KEY_ACTIONS } from "./own-model-key-actions.ts";
import { IAM_WORKSPACE_PATTERNS } from "./workspace-patterns.ts";

/**
 * `FluxIQBrowserSession` (session policy): the fixed scope of a connected
 * browser's credential. A session policy only narrows, so the browser reaches
 * the intersection of this and its user's identity policies (with
 * `FluxIQUserAccess`, its user's own Studio data and browsers).
 *
 * - `SessionScope`: `gateway:*` and `studio:*` (connect, Studio read, write
 *   and run) in the workspace. Not `iam:*`, `ops:*` or `platform:*`, which the
 *   browser therefore never reaches, and of `secrets:*` only the next two.
 * - `SessionOwnModelKey`: saving, replacing and removing the key the session's
 *   own person's chats use (`IAM_OWN_MODEL_KEY_ACTIONS`), on that person's own
 *   user and nowhere else, so whether the browser may is decided by the
 *   person's identity policies (`FluxIQUserAccess`'s `OwnModelKey`) and never
 *   reaches another person's key or the workspace's choice (t950).
 * - `SessionModelAccess`: model access, which a connected client always has
 *   (user, 2026-11-14 and 2026-11-16): reading the Secret Keys snapshot
 *   (`secrets:Snapshot`) in the workspace, which is how the browser shows
 *   whether its person's chats can reach a model (the paired route projects
 *   that answer to readiness alone, and the model-access push asks the same
 *   decision, so the two never disagree), and using a key for the person's own
 *   model calls (`secrets:UseKey`, which the key-use authority decides for a
 *   trusted client). Which keys stays the identity policies' decision
 *   (`FluxIQUserAccess`'s `OwnData` reaches only the person's own). Every other
 *   `secrets:*` action stays out of scope; `secrets:RevealKey` is denied.
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
  { Sid: "SessionOwnModelKey", Effect: "Allow", Action: [...IAM_OWN_MODEL_KEY_ACTIONS], Resource: IAM_WORKSPACE_PATTERNS.ownUser },
  { Sid: "SessionModelAccess", Effect: "Allow", Action: ["secrets:Snapshot", "secrets:UseKey"], Resource: [IAM_WORKSPACE_PATTERNS.content, IAM_WORKSPACE_PATTERNS.workspace] },
  { Sid: "SessionNeverIdentityOrReveal", Effect: "Deny", Action: ["iam:*", "secrets:RevealKey"], Resource: "*" },
  ...iamActionListStatements("SessionNeverDestructive", "Deny", IAM_DESTRUCTIVE_ACTIONS, ["*"])
]);
