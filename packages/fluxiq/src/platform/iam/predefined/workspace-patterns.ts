/**
 * The resource patterns the predefined policies grant in "the workspace".
 *
 * - `content`: every FRN whose workspace segment is the principal's
 *   workspace (`studio`, `secrets`, `gateway`, `iam` and `ops` resources).
 * - `workspace`: the workspace's own FRN, which a top-level create or list and
 *   an action on no specific resource evaluate against
 *   (`iamWorkspaceFrn`). `content` does not match it, because its workspace
 *   segment is empty (t788-A), so a workspace-wide grant lists both.
 *
 * - `ownUser`: the principal's own user in the workspace
 *   (`frn:fluxiq:iam:<ws>:user/<principal>`), which an endpoint declaring
 *   `endpointResource.selfUser()` evaluates against.
 *
 * Each binds `${fluxiq:WorkspaceId}` (and `ownUser` `${fluxiq:PrincipalId}`)
 * at compile time; for a principal with no workspace they match nothing.
 */
export const IAM_WORKSPACE_PATTERNS = Object.freeze({
  content: "frn:fluxiq:*:${fluxiq:WorkspaceId}:*",
  workspace: "frn:fluxiq:platform::workspace/${fluxiq:WorkspaceId}",
  ownUser: "frn:fluxiq:iam:${fluxiq:WorkspaceId}:user/${fluxiq:PrincipalId}"
});
