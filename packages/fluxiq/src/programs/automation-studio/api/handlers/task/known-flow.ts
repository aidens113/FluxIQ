// The Flow an identical task already lives under (t869), asked by the chat's "automate this" so a
// repeat of a task reuses its Flow and does not make a blank one each time. Only the exact same task
// has one (`answer-first/route/known-flow.ts`).
//
// **It never fails the task.** A memory that cannot be read, or a Flow that is gone, answers no Flow,
// and the chat makes a new one. This is `read`, so a command reaches it; it is not on a token's list,
// because only Core's own chat asks.
//
// **Asked by a Flow instead** (t885), it says whether a task lives under that Flow and where the task
// its goal names starts (`answer-first/route/task-of-flow.ts`): the chat's Run of a task's Flow takes
// the road the same words take, because the project run path cannot run a task's Flow before its
// steps are proven. That read fails where it cannot read, and the chat then runs the Flow as any other.

import { endpointResource } from "../../../../_shared/iam/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstKnownFlow, automationStudioAnswerFirstTaskOfFlow } from "../../../../../framework/automation-service/service/answer-first/route/index.ts";
import { boundedIdentifier } from "../../../../../framework/automation-service/service/flow-bootstrap-requests/index.ts";
import type { AutomationStudioApiDependencies } from "../dependencies.ts";

/** Either shape of `GetTaskKnownFlowRequest`, read field by field. */
type Asked = { projectId?: unknown; instructionText?: unknown; startLocation?: unknown; flowId?: unknown };

export function registerTaskKnownFlowEndpoint(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  // Read when asked, never at registration: a registry is built before the service is wired.
  const ports = () => ({ paths: service.projectPaths, projects: service.projects });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getTaskKnownFlow,
    permission: "programs.read",
    classification: "read",
    action: "studio:GetTaskKnownFlow",
    accessLevel: "Read",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload: Asked = request.payload !== null && typeof request.payload === "object" && !Array.isArray(request.payload) ? request.payload as Asked : {};
      const projectId = boundedIdentifier(payload.projectId, "Project");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      if (payload.instructionText === undefined && payload.flowId !== undefined) {
        const flowId = boundedIdentifier(payload.flowId, "Flow");
        const task = await automationStudioAnswerFirstTaskOfFlow(service, ports(), { projectId, flowId });
        return { ok: true, payload: task ? { flowId, ...task } : {} };
      }
      if (typeof payload.instructionText !== "string" || !payload.instructionText.trim()) return { ok: false, error: "Known-flow lookup needs the task's words." };
      try {
        const flowId = await automationStudioAnswerFirstKnownFlow(service, ports(), { projectId, instructionText: payload.instructionText, startLocation: typeof payload.startLocation === "string" ? payload.startLocation : undefined });
        if (flowId === undefined) return { ok: true, payload: {} };
        await service.getFlow(projectId, flowId);
        return { ok: true, payload: { flowId } };
      } catch {
        return { ok: true, payload: {} };
      }
    }
  });
}
