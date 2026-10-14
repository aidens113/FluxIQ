import type { AutomationStudioFlowCandidateSubmissionController, AutomationStudioFlowCandidateTrialGate } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioProjectSupervisorPorts } from "./ports.ts";
import type { AutomationStudioProjectSupervisorState } from "./state.ts";

/**
 * What every supervisor tool works with in one run: the ports it was given,
 * what it knows of the build, the whole candidate's submission controller and
 * trial gate, and the run's signal.
 */
export type AutomationStudioProjectSupervisorContext = {
  ports: AutomationStudioProjectSupervisorPorts;
  state: AutomationStudioProjectSupervisorState;
  controller: AutomationStudioFlowCandidateSubmissionController;
  gate: AutomationStudioFlowCandidateTrialGate;
  signal: AbortSignal | undefined;
};
