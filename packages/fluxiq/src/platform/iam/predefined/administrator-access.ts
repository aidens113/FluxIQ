import { defineIamPredefinedPolicy } from "./define-predefined-policy.ts";
import { IAM_WORKSPACE_PATTERNS } from "./workspace-patterns.ts";

/**
 * `FluxIQAdministratorAccess`: every action today's `admin` role reaches, in
 * the workspace. Today's `admin` holds all eight permissions, so it reaches
 * every registered endpoint; the endpoints' actions are in the services
 * `studio`, `secrets`, `iam` and `ops` (`gateway` has no endpoint yet and is
 * granted so the endpoints admin will reach there are not a gap).
 *
 * - `AdministratorContent` is an unconditional `Allow *` on the workspace's
 *   content (`frn:fluxiq:*:${fluxiq:WorkspaceId}:*`; operator programs are
 *   `frn:fluxiq:ops:<ws>:program/<id>`, inside it). That makes it a full-access
 *   grant, so the single local owner, who is `admin` today, keeps the list fast
 *   path and local performance does not change. It reaches no `platform:`
 *   resource: platform FRNs have no workspace segment.
 * - `AdministratorWorkspace` grants the workspace services, not `platform:*`,
 *   on the workspace's own FRN (what a top-level create or list and an action
 *   on no specific resource evaluate against): accounts and workspaces are the
 *   provisioner's and the operator's, never a workspace admin's.
 * - Wildcards, not a list: admin reaches every endpoint whatever its
 *   permission, so a new endpoint is admin's the moment it registers, as it is
 *   today. The parity test pins that this equals today's check exactly.
 */
export const IAM_ADMINISTRATOR_ACCESS = defineIamPredefinedPolicy("FluxIQAdministratorAccess", "v1", [
  {
    Sid: "AdministratorContent",
    Effect: "Allow",
    Action: "*",
    Resource: IAM_WORKSPACE_PATTERNS.content
  },
  {
    Sid: "AdministratorWorkspace",
    Effect: "Allow",
    Action: ["studio:*", "secrets:*", "gateway:*", "iam:*", "ops:*"],
    Resource: IAM_WORKSPACE_PATTERNS.workspace
  }
]);
