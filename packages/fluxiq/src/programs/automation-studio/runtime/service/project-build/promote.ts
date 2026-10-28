import { promoteAutomationStudioCandidateTrial } from "../candidate-trial/index.ts";
import { automationStudioProjectBuildRecords } from "./records.ts";
import { AutomationStudioProjectBuildTaskChecklist } from "./task-checklist.ts";
import type { AutomationStudioProjectBuildPorts } from "./types.ts";

// A project build's promotion (unit A5c): the candidate's own promotion,
// unchanged (`../candidate-trial/promotion.ts`), and then the build record's
// ending, which on a yes the supervisor leaves to the caller
// (`project-agents/supervisor/ports.ts`). Any other ending the supervisor
// already wrote; a record that has one is left as it is. Where the build's task
// spec declared the answers its parts owe, they ride on the proposal's trial
// (`requestedOutput`) for apply to save on the Flow (t764).

export async function promoteAutomationStudioProjectBuild(project: AutomationStudioProjectBuildPorts, input: Parameters<typeof promoteAutomationStudioCandidateTrial>[0]): ReturnType<typeof promoteAutomationStudioCandidateTrial> {
  const records = automationStudioProjectBuildRecords(project);
  const ref = { projectId: input.record.projectId, flowId: input.record.flowId, buildId: project.buildId };
  const view = await records.read(ref);
  // The answers the build's latest task spec declared go with the proposal, which apply saves on the Flow for its finished runs' check (t764).
  const requestedOutput = AutomationStudioProjectBuildTaskChecklist.requestedOutput(view?.record.taskSpecs.at(-1)?.taskSpec);
  const promoted = await promoteAutomationStudioCandidateTrial(requestedOutput
    ? { ...input, propose: async (proposal) => await input.propose({ ...proposal, candidateTrial: { ...proposal.candidateTrial, requestedOutput } }) }
    : input);
  if (view && !view.record.ending) {
    await records.end(ref, promoted.status === "proposed"
      ? { outcome: "promoted", reason: "The assembled Flow passed its whole trial and was proposed." }
      : { outcome: "partial", reason: "The assembled Flow was kept as a draft: its trial's yes did not stand for promotion." });
  }
  return promoted;
}
