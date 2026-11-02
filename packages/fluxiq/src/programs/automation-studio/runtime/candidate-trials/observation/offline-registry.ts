import type { TrialOfflineRunner } from "./offline-runner.ts";
import type { ExecutionObservationSource, ManagedExecutionCallbackRegistration } from "../../../../../runtime/execution-observation/index.ts";
import type { AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";

export const trialOfflineRunners = new WeakMap<object, { runner: TrialOfflineRunner; contract?: { callbacks: ExecutionObservationSource; registration: Extract<ManagedExecutionCallbackRegistration<TrialOfflineRunner, [object, AutomationStudioCandidateTrialRequest], Promise<AutomationStudioCandidateTrialResult>>, { contract: "no_direct_effects" }>; current(): boolean } }>();
