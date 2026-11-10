// Reading a task's attempts back (t869): one attempt by its id, and every attempt a chat thread
// holds. The attempts are kept per Flow, and a person asks by thread or by attempt, so the store's
// locator joins the two.
//
// **These assert the project's domain access**, as the dataset and conversation reads do
// (`./datasets.ts`, `./conversations.ts`): a result holds rows, and a row is stored page content.
//
// **What Core cannot read is refused, in other words than what is not there.** Reading a file nobody
// can read as "no such attempt" would tell a person their result never happened.

import { endpointResource } from "../../../../_shared/iam/index.ts";
import type { ProgramApiResponse } from "../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type GetTaskAttemptRequest, type ListConversationTaskAttemptsRequest } from "../../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstOutcomeOfAttempt, automationStudioAnswerFirstOutcomesOfConversation, AutomationStudioAnswerFirstAttemptLocatorUnreadable, AutomationStudioAnswerFirstAttemptsUnreadable } from "../../../../../framework/automation-service/service/answer-first/attempt-store/index.ts";
import { boundedIdentifier } from "../../../../../framework/automation-service/service/flow-bootstrap-requests/index.ts";
import type { AutomationStudioApiDependencies } from "../dependencies.ts";
import { automationStudioApiTaskOutcomesWithProvenance } from "./attempt-provenance.ts";
import { automationStudioApiTaskOutcomeSource } from "./attempt-store.ts";
import { getTaskAttemptInput, listConversationTaskAttemptsInput } from "@fluxiq/contracts/program-api-inputs";

const NOT_FOUND = "I could not find that attempt.";
const UNREADABLE = "What was kept of this task could not be read, so I cannot say how it went.";

export function registerTaskAttemptEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt, assistant: { input: getTaskAttemptInput, summary: "Shows one attempt at a task and how it went.", phrases: ["how did that attempt go"], contextArgs: { projectId: "projectId" } },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetTaskAttempt",
    accessLevel: "Read",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = taskAttemptPayload<GetTaskAttemptRequest>(request.payload);
      const projectId = boundedIdentifier(payload.projectId, "Project");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const attemptId = boundedIdentifier(payload.attemptId, "Attempt");
      return await unreadableRefused(async () => {
        const outcome = await automationStudioAnswerFirstOutcomeOfAttempt(automationStudioApiTaskOutcomeSource(service), projectId, attemptId);
        const [told] = outcome ? await automationStudioApiTaskOutcomesWithProvenance(service, projectId, [outcome]) : [];
        return told ? { ok: true, payload: { outcome: told } } : { ok: false, error: NOT_FOUND, errorCode: "task_attempt.not_found" };
      });
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts, assistant: { input: listConversationTaskAttemptsInput, summary: "Lists the attempts made in a chat thread.", phrases: ["what did we try in this chat"], contextArgs: { projectId: "projectId" } },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListConversationTaskAttempts",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = taskAttemptPayload<ListConversationTaskAttemptsRequest>(request.payload);
      const projectId = boundedIdentifier(payload.projectId, "Project");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const conversationId = boundedIdentifier(payload.conversationId, "Conversation");
      return await unreadableRefused(async () => {
        const outcomes = await automationStudioAnswerFirstOutcomesOfConversation(automationStudioApiTaskOutcomeSource(service), projectId, conversationId);
        return { ok: true, payload: { outcomes: await automationStudioApiTaskOutcomesWithProvenance(service, projectId, outcomes) } };
      });
    }
  });
}

/** Refuses, in words, a read that met a file it could not read. Anything else is the registry's to report. */
async function unreadableRefused(read: () => Promise<ProgramApiResponse>): Promise<ProgramApiResponse> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AutomationStudioAnswerFirstAttemptsUnreadable || error instanceof AutomationStudioAnswerFirstAttemptLocatorUnreadable) return { ok: false, error: UNREADABLE, errorCode: "task_attempt.unreadable" };
    throw error;
  }
}

function taskAttemptPayload<TRequest>(payload: unknown): Partial<TRequest> {
  return payload !== null && typeof payload === "object" && !Array.isArray(payload) ? payload as Partial<TRequest> : {};
}
