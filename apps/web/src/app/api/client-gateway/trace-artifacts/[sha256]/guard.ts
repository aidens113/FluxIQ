import type { WorkspaceRouteContext, WorkspaceRouteRefusal } from "../../../../../lib/workspaces/routes";
import { traceUploadCurrent } from "./current";

/** Fresh authority decides admission; the synchronous callback only adds refusals at intake. */
export function createTraceUploadGuard(owner: WorkspaceRouteContext, url: string) {
  let refusal: WorkspaceRouteRefusal | null = null;
  return {
    stillAuthorized: async () => {
      const current = await owner.revalidate();
      if (!current.ok) {
        refusal = current;
        return false;
      }
      if (!owner.current()) {
        refusal = { ok: false, status: 401, error: "Authentication required" };
        return false;
      }
      return true;
    },
    beforeIntake: () => traceUploadCurrent(owner, url),
    refusal: () => refusal
  };
}
