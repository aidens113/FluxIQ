// What the task remembers of how an attempt's steps came to be, in the words a person is told it in
// (`AutomationStudioTaskOutcome.provenance`). An attempt the task has no memory of has no field, and a
// memory that cannot be read costs the card its marks and never the read.

import type { AutomationStudioTaskOutcome, AutomationStudioTaskOutcomeProvenance } from "../../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstTaskMemoryOf, type AutomationStudioAnswerFirstAttemptProvenance } from "../../../../../framework/automation-service/service/answer-first/task-memory/index.ts";
import type { AutomationStudioService } from "../../../../../framework/automation-service/index.ts";

const ROUTE_WORDS: Record<AutomationStudioAnswerFirstAttemptProvenance["route"], string> = {
  build: "worked it out from scratch",
  use: "ran the Flow it had saved",
  repair: "repaired the Flow it had saved"
};

export function automationStudioApiTaskOutcomeProvenance(provenance: AutomationStudioAnswerFirstAttemptProvenance): AutomationStudioTaskOutcomeProvenance {
  const from = provenance.startedFrom;
  return {
    route: ROUTE_WORDS[provenance.route],
    startedFrom: from === undefined ? "nothing saved" : `a saved Flow of ${from.steps} ${from.steps === 1 ? "step" : "steps"}`,
    // A step the Flow's run reached, whether it passed or not, was reached.
    steps: provenance.steps.map((step) => ({ position: step.position, label: step.label ?? `Step ${step.position}`, from: step.from, ran: step.ran === "passed" || step.ran === "failed" }))
  };
}

/** The outcomes with what the task remembers added, one memory read each. */
export async function automationStudioApiTaskOutcomesWithProvenance(service: Pick<AutomationStudioService, "projectPaths" | "projects">, projectId: string, outcomes: AutomationStudioTaskOutcome[]): Promise<AutomationStudioTaskOutcome[]> {
  const memory = automationStudioAnswerFirstTaskMemoryOf(service, { paths: service.projectPaths, projects: service.projects });
  return await Promise.all(outcomes.map(async (outcome) => {
    try {
      const provenance = await memory.provenance(projectId, outcome.attempt.attemptId);
      return provenance === undefined ? outcome : { ...outcome, provenance: automationStudioApiTaskOutcomeProvenance(provenance) };
    } catch {
      return outcome;
    }
  }));
}
