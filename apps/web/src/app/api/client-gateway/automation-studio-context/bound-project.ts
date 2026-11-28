import type { WorkspaceRouteBinding } from "../../../../lib/workspaces/routes";
import { ContextRouteError } from "./failure";
import type { ContextSelection } from "./selection";

const BOUND = "This browser was connected for one project only, so it cannot switch to another. Switch projects in the FluxIQ panel, or connect the browser again without choosing a project.";

/**
 * A paired client connected for one project (its session's project) keeps to it: the person's current
 * project may be set to that project, with or without a Flow, and to nothing else, a clear included.
 * The panel and an unbound client are not limited here; IAM and the domain decide them.
 */
export function requireBoundProject(binding: WorkspaceRouteBinding, selection: ContextSelection): void {
  if (binding.channel !== "paired-client" || binding.projectId === null) return;
  if (selection.activeProjectId !== binding.projectId) throw new ContextRouteError(403, BOUND);
}
