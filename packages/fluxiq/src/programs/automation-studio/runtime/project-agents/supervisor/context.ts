import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowCandidateSubmissionController, AutomationStudioFlowCandidateTrialGate } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
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
  /**
   * The run's one whole test (`./whole-trial.ts`), which every path that tests
   * the whole Flow goes through -- the supervisor's own and a single-subflow
   * brief's -- so each test is timed against the build's working time and
   * remembered for its ending once (G2). Absent where a test builds its own.
   */
  wholeTest?: (value: JsonObject, signal: AbortSignal | undefined) => Promise<AutomationStudioLlmEvidenceToolExecutionResult>;
};
