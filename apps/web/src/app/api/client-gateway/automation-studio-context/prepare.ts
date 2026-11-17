import { getWorkspaceWebPresentation } from "../../../../lib/fluxiq";
import type { WorkspaceRouteResourceResolver } from "../../../../lib/workspaces/routes";
import { requireOwnedContextClient } from "./client";
import { ContextRouteError } from "./failure";
import { readContextSelection } from "./selection";

export async function prepareContextWrite(request: Request, selected: Parameters<WorkspaceRouteResourceResolver>[0]) {
  if (selected.caller.binding.channel !== "panel") throw new ContextRouteError(403, "This endpoint is not available to a paired client.");
  await selected.fluxiq.programs.clientGateway.ready();
  const selection = await readContextSelection(request);
  const userId = selected.caller.binding.userId;
  requireOwnedContextClient(selected.fluxiq, userId, selection.clientId);
  const presentation = getWorkspaceWebPresentation(selected.workspaceId, selected.fluxiq, { userId, channel: selected.caller.channel, ...(selection.clientId ? { clientId: selection.clientId } : {}) });
  return { selection, write: presentation.beginContextWrite() };
}
