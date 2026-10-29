import { defineIamPredefinedPolicy } from "./define-predefined-policy.ts";
import { IAM_WORKSPACE_PATTERNS } from "./workspace-patterns.ts";

/**
 * `FluxIQOwnerFullAccess`: the single owner's implicit everything, as a
 * policy. One unconditional `Allow *` on the workspace's content and on the
 * workspace's own FRN.
 *
 * - The workspace FRN is listed because the content pattern does not match it
 *   (t788-A); without it the owner could not create or list at top level.
 * - The statement has no `Condition`, `Action` lists `*` and `Resource` lists
 *   the content pattern, so `isIamFullAccessStatement` holds and a set with no
 *   `Deny` takes the full-access fast path: list endpoints skip per-item
 *   checks and local performance does not change. The fast path covers the
 *   workspace FRN too, since this grant matches it.
 * - `Resource` is not `*`: the owner reaches nothing outside the workspace
 *   (no `platform` accounts, no platform-level operator programs).
 */
export const IAM_OWNER_FULL_ACCESS = defineIamPredefinedPolicy("FluxIQOwnerFullAccess", "v1", [
  { Sid: "OwnerFullAccess", Effect: "Allow", Action: "*", Resource: [IAM_WORKSPACE_PATTERNS.content, IAM_WORKSPACE_PATTERNS.workspace] }
]);
