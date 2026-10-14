import { promoteAutomationStudioCandidateTrial } from "../candidate-trial/index.ts";
import { automationStudioProjectBuildRecords } from "./records.ts";
import type { AutomationStudioProjectBuildPorts } from "./types.ts";

// A project build's promotion (unit A5c): the candidate's own promotion,
// unchanged (`../candidate-trial/promotion.ts`), and then the build record's
// ending, which on a yes the supervisor leaves to the caller
// (`project-agents/supervisor/ports.ts`). Any other ending the supervisor
// already wrote; a record that has one is left as it is.

export async function promoteAutomationStudioProjectBuild(project: AutomationStudioProjectBuildPorts, input: Parameters<typeof promoteAutomationStudioCandidateTrial>[0]): ReturnType<typeof promoteAutomationStudioCandidateTrial> {
  const promoted = await promoteAutomationStudioCandidateTrial(input);
  const records = automationStudioProjectBuildRecords(project);
  const ref = { projectId: input.record.projectId, flowId: input.record.flowId, buildId: project.buildId };
  const view = await records.read(ref);
  if (view && !view.record.ending) {
    await records.end(ref, promoted.status === "proposed"
      ? { outcome: "promoted", reason: "The assembled Flow passed its whole trial and was proposed." }
      : { outcome: "partial", reason: "The assembled Flow was kept as a draft: its trial's yes did not stand for promotion." });
  }
  return promoted;
}
