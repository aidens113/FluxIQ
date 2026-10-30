import type { AutomationStudioService } from "../../runtime/index.ts";
import type { AutomationStudioProjectCatalog } from "./types.ts";

// Whether an id names a project, read through the service's public surface.
//
// The service has no public non-throwing project lookup, and `listProjects`
// lists one domain scope at a time, so the existence check rides on
// `assertProjectDomainAccess(id, null)`: it resolves for a global project,
// refuses a project of another domain scope (which exists), and refuses an
// unknown id. The two refusals are told apart by the runtime's messages
// (`runtime/service.ts` and `runtime/service/projects/store.ts`
// `findProjectSummary`); every other failure is rethrown. The tests beside this
// directory pin both messages against a real service, so a reworded one fails
// there rather than here. A public `hasProject(id)` on the service would
// replace all of this.

const UNKNOWN_PROJECT_PREFIX = "Unknown Automation Studio project:";
const OTHER_DOMAIN_SCOPE = "Automation Studio project is unavailable in this domain scope.";

export function automationStudioServiceProjectCatalog(service: Pick<AutomationStudioService, "assertProjectDomainAccess">): AutomationStudioProjectCatalog {
  return {
    async hasProject(projectId) {
      try {
        await service.assertProjectDomainAccess(projectId, null);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : undefined;
        if (message === OTHER_DOMAIN_SCOPE) return true;
        if (typeof message === "string" && message.startsWith(UNKNOWN_PROJECT_PREFIX)) return false;
        throw error;
      }
    }
  };
}
