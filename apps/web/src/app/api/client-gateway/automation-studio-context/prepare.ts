import { getWorkspaceWebPresentation } from "../../../../lib/fluxiq";
import type { WorkspaceRouteResourceResolver } from "../../../../lib/workspaces/routes";
import { requireBoundProject } from "./bound-project";
import { requireOwnedContextClient } from "./client";
import { ContextRouteError } from "./failure";
import { readContextSelection } from "./selection";

const PAIRED_NAMES_CLIENT = "A paired client sets the person's current project for itself, so it names no clientId.";

/**
 * Reads the selection and opens the write. The panel may still name a client's own slot (`clientId`).
 * A paired client writes the person's one value, the same slot the panel writes without a clientId, so
 * the panel and every client read back what either set last.
 */
export async function prepareContextWrite(request: Request, selected: Parameters<WorkspaceRouteResourceResolver>[0]) {
  const binding = selected.caller.binding;
  await selected.fluxiq.programs.clientGateway.ready();
  const selection = await readContextSelection(request);
  const userId = binding.userId;
  if (binding.channel === "paired-client") {
    if (selection.clientId) throw new ContextRouteError(400, PAIRED_NAMES_CLIENT);
    requireBoundProject(binding, selection);
    const presentation = getWorkspaceWebPresentation(selected.workspaceId, selected.fluxiq, { userId, channel: "paired-client" });
    return { selection, write: presentation.beginContextWrite() };
  }
  requireOwnedContextClient(selected.fluxiq, userId, selection.clientId);
  const presentation = getWorkspaceWebPresentation(selected.workspaceId, selected.fluxiq, { userId, channel: selected.caller.channel, ...(selection.clientId ? { clientId: selection.clientId } : {}) });
  return { selection, write: presentation.beginContextWrite() };
}
