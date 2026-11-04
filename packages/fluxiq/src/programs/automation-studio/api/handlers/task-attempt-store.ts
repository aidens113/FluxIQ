import { automationStudioAnswerFirstAttemptStoreOf, type AutomationStudioAnswerFirstAttemptStore } from "../../../../framework/automation-service/service/answer-first/attempt-store/index.ts";
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";

/** The attempt store the service's attempts write through, whose memory fallback a read therefore shares. */
export function automationStudioApiTaskAttemptStore(service: Pick<AutomationStudioService, "projectPaths" | "flowPaths" | "projects">): AutomationStudioAnswerFirstAttemptStore {
  return automationStudioAnswerFirstAttemptStoreOf(service, { paths: service.projectPaths, flows: service.flowPaths, projects: service.projects });
}
