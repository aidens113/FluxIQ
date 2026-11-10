// The Flow an identical task already lives under (t869), asked by the chat's "automate this" so a
// repeat of a task reuses its Flow and does not make a blank one each time. Only the exact same task
// has one (`answer-first/route/known-flow.ts`).
//
// **It never fails the task.** A memory that cannot be read, or a Flow that is gone, answers no Flow,
// and the chat makes a new one. This is `read`, so a command reaches it; it is not on a token's list,
// because only Core's own chat asks.

import { endpointResource } from "../../../../_shared/iam/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type GetTaskKnownFlowRequest } from "../../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstKnownFlow } from "../../../../../framework/automation-service/service/answer-first/route/index.ts";
import { boundedIdentifier } from "../../../../../framework/automation-service/service/flow-bootstrap-requests/index.ts";
import type { AutomationStudioApiDependencies } from "../dependencies.ts";

export function registerTaskKnownFlowEndpoint(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getTaskKnownFlow, assistant: { hidden: "The chat looks up an earlier Flow for a repeated task by itself; a person does not ask for it." },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetTaskKnownFlow",
    accessLevel: "Read",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload: Partial<GetTaskKnownFlowRequest> = request.payload !== null && typeof request.payload === "object" && !Array.isArray(request.payload) ? request.payload as Partial<GetTaskKnownFlowRequest> : {};
      const projectId = boundedIdentifier(payload.projectId, "Project");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      if (typeof payload.instructionText !== "string" || !payload.instructionText.trim()) return { ok: false, error: "Known-flow lookup needs the task's words." };
      try {
        const flowId = await automationStudioAnswerFirstKnownFlow(service, { paths: service.projectPaths, projects: service.projects }, { projectId, instructionText: payload.instructionText, startLocation: typeof payload.startLocation === "string" ? payload.startLocation : undefined });
        if (flowId === undefined) return { ok: true, payload: {} };
        await service.getFlow(projectId, flowId);
        return { ok: true, payload: { flowId } };
      } catch {
        return { ok: true, payload: {} };
      }
    }
  });
}
