import type { AutomationStudioFlowRunLifecycleEvent } from "./lifecycle-event.ts";
import type { AutomationStudioFlowRunHandlerDisposition } from "./handler-disposition.ts";
/**
 * One handler execution, as the runtime stream keeps it (`handler_execution`,
 * beside `recovery_attempt`). `executionId` is unique within the run.
 * `disposition` is the decided way on; `outcome` says whether the body ran to
 * its end (`succeeded`), failed inside (`failed`), or was refused before it
 * ran (`refused`: a budget, an occurrence already run, or a disposition the
 * event does not allow). `incidentId` is absent at boundaries that open no
 * incident (`start`, `before`, `before_next`).
 */
export type AutomationStudioFlowRunHandlerExecutionRecord = {
  executionId: string;
  handlerId: string;
  event: AutomationStudioFlowRunLifecycleEvent;
  /** The invocation ids of the frames the handler fired in, outermost first. */
  framePath: string[];
  nodeId: string;
  incidentId?: string;
  disposition: AutomationStudioFlowRunHandlerDisposition;
  outcome: "succeeded" | "failed" | "refused";
  startedAt: number;
  finishedAt?: number;
};
