import { pairedClientProjectDomainRefusal, programDomainScope } from "fluxiq/server";
import type { WorkspaceRouteContext } from "../../../../lib/workspaces/routes";
import { requireOwnedContextClient } from "./client";
import { ContextRouteError } from "./failure";
import type { ContextSelection } from "./selection";

export async function validateContextSelection(owner: WorkspaceRouteContext, url: string, selection: ContextSelection) {
  let current = await owner.revalidate();
  if (!current.ok) throw new ContextRouteError(current.status, current.error);
  requireOwnedContextClient(owner.fluxiq, current.caller.binding.userId, selection.clientId);
  if (selection.activeProjectId !== null) {
    const domain = await pairedClientProjectDomainRefusal(owner.fluxiq.programs.automationStudio, selection.activeProjectId, programDomainScope(url).domainId);
    current = await owner.revalidate();
    if (!current.ok) throw new ContextRouteError(current.status, current.error);
    if (domain) throw new ContextRouteError(403, "Selected project is not available in this domain.");
    if (selection.activeFlowId !== null) {
      try {
        await owner.fluxiq.programs.automationStudio.getFlow(selection.activeProjectId, selection.activeFlowId);
      } catch {
        throw new ContextRouteError(403, "Selected Flow is not available in this project.");
      }
      current = await owner.revalidate();
      if (!current.ok) throw new ContextRouteError(current.status, current.error);
      const afterFlowDomain = await pairedClientProjectDomainRefusal(owner.fluxiq.programs.automationStudio, selection.activeProjectId, programDomainScope(url).domainId);
      current = await owner.revalidate();
      if (!current.ok) throw new ContextRouteError(current.status, current.error);
      if (afterFlowDomain) throw new ContextRouteError(403, "Selected project is not available in this domain.");
    }
  }
  requireOwnedContextClient(owner.fluxiq, current.caller.binding.userId, selection.clientId);
  return current.caller;
}
