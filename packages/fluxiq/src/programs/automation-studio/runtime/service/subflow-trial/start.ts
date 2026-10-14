// A partial trial's start: the deployment's start hook, exactly as a whole
// candidate's trial calls it (`../candidate-trial/run.ts`,
// `automationStudioCandidateTrialStart`), under the candidate id a subflow
// trial of this brief is known by. Shared by the run, which calls it when no
// start was prepared, and the port's `prepareStart`, which the subflow trial
// gate calls ahead of its site-reset check (t578), so the hook runs once per
// trial either way.

import type { AutomationStudioSubflowScope } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioCandidateTrialStart, type AutomationStudioCandidateTrialPorts, type AutomationStudioCandidateTrialStart } from "../candidate-trial/index.ts";
import type { AutomationStudioSubflowTrialPorts } from "./types.ts";

/** Runs the deployment's start hook for one partial trial of `scope`'s proposal at `revision` and `digest`; `not_reset` without one. */
export async function automationStudioSubflowTrialStart(input: { scope: Pick<AutomationStudioSubflowScope, "buildId" | "briefId">; revision: number; digest: string; signal: AbortSignal }, ports: AutomationStudioSubflowTrialPorts): Promise<AutomationStudioCandidateTrialStart> {
  // The ports the whole-candidate start reads (the hook, the project, the Flow and the start location), without this trial's
  // scoped judge and partial runner, which that function never calls.
  const { judge: _judge, execute: _execute, ...shared } = ports;
  const startPorts: AutomationStudioCandidateTrialPorts = { ...shared, judge: async () => { throw new Error("A trial's start is never judged."); } };
  return await automationStudioCandidateTrialStart({ candidateId: `subflow.${input.scope.buildId}.${input.scope.briefId}`, revision: input.revision, digest: input.digest, signal: input.signal }, startPorts);
}
