import type { ExecutionScope, ExecutionAdmissionConsumer } from "../../../../../runtime/execution-admission/index.ts";
import type { ExecutionObservationSource } from "../../../../../runtime/execution-observation/index.ts";
import type { AutomationExecutionAdmissionSource } from "../../../../../engine/automation/execution-admission/index.ts";
import type { AutomationStudioBuildToolObserver } from "../../build-execution/tools/index.ts";

export interface CandidateTrialSourceInput {
  readonly scope: ExecutionScope;
  readonly consumer: ExecutionAdmissionConsumer;
  readonly seriesKey: string;
  readonly callbacks: ExecutionObservationSource;
  readonly automation?: AutomationExecutionAdmissionSource | undefined;
  readonly toolObserver?: AutomationStudioBuildToolObserver | undefined;
}
