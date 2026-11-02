import type { ExecutableFlowSnapshot } from "../../../flows/executable/composite/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../contracts.ts";
import type { AutomationStudioCompositeFlow } from "./flow.ts";
import { AutomationStudioCanonicalExecution } from "./execution.ts";

/** Executes supplied immutable snapshots with the root executable composition. */
export function runCanonicalAutomationStudioFlow(flow: AutomationStudioCompositeFlow, snapshots: ExecutableFlowSnapshot[], options: AutomationStudioGraphExecutionOptions = {}, deprecatedPublicationIds: Iterable<string> = [], onExecutedTrace?: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void): Promise<AutomationStudioGraphExecutionTrace> {
  return AutomationStudioCanonicalExecution.run(flow, snapshots, options, deprecatedPublicationIds, onExecutedTrace);
}
