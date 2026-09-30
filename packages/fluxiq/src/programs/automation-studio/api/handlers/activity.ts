// The endpoint the Core panel reads live activity through: the
// latest event of one project and the events before it, exactly as the hub
// keeps them (`runtime/activity/`, `{ current, recent }`, recent capped by the
// hub).
//
// `programs.read` and `read`: it changes nothing and runs nothing.
//
// It does not assert the project's domain scope, and that is deliberate, for
// the rule `tests/domain-scope.test.ts` pins: the assertion guards stored
// content that came out of a domain, and an activity event carries none. Its
// labels are Core's own sentences, tool and node ids and authored step labels
// (D4 in the live-activity plan), the same structure a run detail shows, and
// it is not stored at all -- the hub holds the last few events in memory.
//
// Registered against its own dependency record, like the conversation
// endpoints, so a test can hand it a hub without a service. The process's hub
// is the default.

import { AUTOMATION_STUDIO_ENDPOINTS, type ActivityReadRequest } from "../contracts.ts";
import type { GlobalProgramApiRegistry } from "../../../_shared/api.ts";
import { automationStudioActivityHub, type AutomationStudioActivitySnapshot } from "../../runtime/activity/index.ts";

export type AutomationStudioActivityApiDependencies = {
  readonly registry: GlobalProgramApiRegistry;
  /** The hub to read. Absent means the one every emission in this process publishes to. */
  readonly activity?: { snapshot(projectId: string): AutomationStudioActivitySnapshot };
};

export function registerAutomationStudioActivityEndpoints(dependencies: AutomationStudioActivityApiDependencies): void {
  const { registry } = dependencies;
  const activity = dependencies.activity ?? automationStudioActivityHub;

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getActivity,
    permission: "programs.read",
    classification: "read",
    handler: async (request) => {
      const payload: Partial<ActivityReadRequest> = request.payload && typeof request.payload === "object" ? request.payload as Partial<ActivityReadRequest> : {};
      const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
      if (!projectId) throw new Error("Reading live activity needs a project ID.");
      return { ok: true, payload: activity.snapshot(projectId) };
    }
  });
}
