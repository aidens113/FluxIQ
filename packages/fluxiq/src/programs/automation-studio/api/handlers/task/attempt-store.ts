import { automationStudioAnswerFirstAttemptStoreOf, type AutomationStudioAnswerFirstAttemptStore, type AutomationStudioAnswerFirstOutcomeSource } from "../../../../../framework/automation-service/service/answer-first/attempt-store/index.ts";
import { automationStudioAnswerFirstAttemptsRead } from "../../../../../framework/automation-service/service/answer-first/interrupted/index.ts";
import type { AutomationStudioService } from "../../../../../framework/automation-service/index.ts";

type Ports = Pick<AutomationStudioService, "projectPaths" | "flowPaths" | "projects">;

/** The attempt store the service's attempts write through, whose memory fallback a read therefore shares. */
export function automationStudioApiTaskAttemptStore(service: Ports): AutomationStudioAnswerFirstAttemptStore {
  return automationStudioAnswerFirstAttemptStoreOf(service, { paths: service.projectPaths, flows: service.flowPaths, projects: service.projects });
}

/**
 * What a person's read of attempts goes through: where they are kept, and their rows with a row whose Core died
 * read as interrupted, never as still working (`answer-first/interrupted/`).
 */
export function automationStudioApiTaskOutcomeSource(service: Ports): AutomationStudioAnswerFirstOutcomeSource {
  const reads = automationStudioAnswerFirstAttemptsRead(service, { paths: service.projectPaths, flows: service.flowPaths, projects: service.projects });
  return { locator: automationStudioApiTaskAttemptStore(service).locator, list: reads.list };
}
