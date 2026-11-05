// "Add budget and carry on" (t869): a person's press on an attempt that ran out of budget, or that a
// restart cut off (`addUsd` may be zero for the second). It spends the person's money, so it is
// `authoring` under `flows.write` like the generation it runs, and it asserts the project's domain
// access first. It is on a paired token's list, narrowed to these three fields.
//
// **Answered at once.** `automationStudioAnswerFirstCarryOn` decides whether the press may start and
// answers; the attempt then goes on in the background, through the same generation path a first
// attempt takes, with no new request fields. This route never awaits it, and a failure of it is
// caught here, so it can never be an unhandled rejection. A refusal reaches the person as Core's own
// sentence.

import { endpointResource } from "../../../../_shared/iam/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type CarryOnTaskAttemptRequest } from "../../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstCarryOn } from "../../../../../framework/automation-service/service/answer-first/carry-on/index.ts";
import { boundedIdentifier, generateFlowBootstrapAdaptationForRequest } from "../../../../../framework/automation-service/service/flow-bootstrap-requests/index.ts";
import type { AutomationStudioApiDependencies } from "../dependencies.ts";

const FIELDS: ReadonlySet<string> = new Set(["projectId", "attemptId", "addUsd", "authSessionId"]);

type FailedBuilds = Parameters<typeof generateFlowBootstrapAdaptationForRequest>[0]["failedBuilds"];

export function registerCarryOnTaskAttemptEndpoint(dependencies: AutomationStudioApiDependencies, generation: { failedBuilds: FailedBuilds }): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.carryOnTaskAttempt,
    permission: "flows.write",
    classification: "authoring",
    action: "studio:CarryOnTaskAttempt",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const actor = request.actor;
      if (!actor) return { ok: false, error: "Carrying an attempt on is unavailable." };
      const payload: Partial<CarryOnTaskAttemptRequest> & Record<string, unknown> = request.payload !== null && typeof request.payload === "object" && !Array.isArray(request.payload) ? request.payload as Partial<CarryOnTaskAttemptRequest> & Record<string, unknown> : {};
      const projectId = boundedIdentifier(payload.projectId, "Project");
      const attemptId = boundedIdentifier(payload.attemptId, "Attempt");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      if (Object.keys(payload).some((key) => !FIELDS.has(key))) return { ok: false, error: "Carrying an attempt on does not accept those request fields." };
      const addUsd = payload.addUsd;
      if (typeof addUsd !== "number" || !Number.isFinite(addUsd) || addUsd < 0) return { ok: false, error: "Carrying an attempt on needs an amount of budget that is zero or more." };
      const answer = await automationStudioAnswerFirstCarryOn(service, { paths: service.projectPaths, flows: service.flowPaths, projects: service.projects }, { projectId, attemptId, addUsd }, async ({ flowId }) => await generateFlowBootstrapAdaptationForRequest(
        { service, failedBuilds: generation.failedBuilds },
        { actor, payload: { projectId, flowId, authSessionId: actor.sessionId, evidenceGuided: true, authoringMode: "answer-first" } }
      ));
      if (!answer.ok) return { ok: false, error: answer.say, errorCode: "task_attempt.carry_on_refused" };
      // Not awaited: the press is answered now, and what the attempt comes to is read back as any attempt is.
      answer.finished.catch(() => undefined);
      return { ok: true, payload: { attemptId: answer.attemptId, budgetUsd: answer.budgetUsd } };
    }
  });
}
