// "Run again" on a task's answer (t869): a person's press, and what means do it again. It spends the
// person's money and acts on their site, so it is `authoring` under `flows.write` like the generation
// it runs, and it asserts the project's domain access first. It is on a paired token's list, narrowed
// to these two fields.
//
// **Nothing here is a field a model can set.** The press names a task and nothing else. That it was
// pressed reaches the attempt by the scope this route sets (`answer-first/run-again/`), and the
// generation request behind it is the one a first attempt sends. No chat command offers it.
//
// **Answered at once**, and a failure of the attempt after the answer is caught here, as a carry-on's
// is (`./attempt-carry-on.ts`). A refusal reaches the person as Core's own sentence.

import { endpointResource } from "../../../../_shared/iam/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type RunTaskAgainRequest } from "../../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstGoalWords, automationStudioAnswerFirstRunAgain } from "../../../../../framework/automation-service/service/answer-first/run-again/index.ts";
import { boundedIdentifier, generateFlowBootstrapAdaptationForRequest } from "../../../../../framework/automation-service/service/flow-bootstrap-requests/index.ts";
import type { AutomationStudioApiDependencies } from "../dependencies.ts";
import { runTaskAgainInput } from "@fluxiq/contracts/program-api-inputs";

const FIELDS: ReadonlySet<string> = new Set(["projectId", "taskId", "authSessionId"]);

type FailedBuilds = Parameters<typeof generateFlowBootstrapAdaptationForRequest>[0]["failedBuilds"];

export function registerRunTaskAgainEndpoint(dependencies: AutomationStudioApiDependencies, generation: { failedBuilds: FailedBuilds }): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.runTaskAgain, assistant: { input: runTaskAgainInput, summary: "Runs a task again.", phrases: ["run that task again", "try the task again"], contextArgs: { projectId: "projectId" } },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:RunTaskAgain",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const actor = request.actor;
      if (!actor) return { ok: false, error: "Running a task again is unavailable." };
      const payload: Partial<RunTaskAgainRequest> & Record<string, unknown> = request.payload !== null && typeof request.payload === "object" && !Array.isArray(request.payload) ? request.payload as Partial<RunTaskAgainRequest> & Record<string, unknown> : {};
      const projectId = boundedIdentifier(payload.projectId, "Project");
      const taskId = boundedIdentifier(payload.taskId, "Task");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      if (Object.keys(payload).some((key) => !FIELDS.has(key))) return { ok: false, error: "Running a task again does not accept those request fields." };
      const sessionId = service.conversations.callerFor(actor).sessionId;
      const goalWords = async (flowId: string) => await automationStudioAnswerFirstGoalWords(service, projectId, flowId);
      const answer = await automationStudioAnswerFirstRunAgain(service, { paths: service.projectPaths, projects: service.projects }, { projectId, taskId, goalWords }, async ({ flowId, startLocation }) => await generateFlowBootstrapAdaptationForRequest(
        { service, failedBuilds: generation.failedBuilds },
        { actor: { ...actor, sessionId }, payload: { projectId, flowId, authSessionId: sessionId, evidenceGuided: true, authoringMode: "answer-first", ...(startLocation === undefined ? {} : { startLocation }) } }
      ));
      if (!answer.ok) return { ok: false, error: answer.say, errorCode: "task_attempt.run_again_refused" };
      // Not awaited: the press is answered now, and what the attempt comes to is read back as any attempt is.
      answer.finished.catch(() => undefined);
      return { ok: true, payload: { attemptId: answer.attemptId } };
    }
  });
}
