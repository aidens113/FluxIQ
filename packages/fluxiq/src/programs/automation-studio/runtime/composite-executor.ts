import type { AutomationStudioFlowArtifact, AutomationStudioPublishedFlowSnapshot } from "../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "./executor.ts";
import { AutomationStudioCanonicalExecution } from "./composite-execution/index.ts";

/** Canonical compiler/composition owner; preserves the normal executor API. */
export async function runCanonicalAutomationStudioFlow(flow: AutomationStudioFlowArtifact, snapshots: AutomationStudioPublishedFlowSnapshot[], options: AutomationStudioGraphExecutionOptions = {}, deprecatedPublicationIds: Iterable<string> = [], onExecutedTrace?: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void): Promise<AutomationStudioGraphExecutionTrace> {
  return AutomationStudioCanonicalExecution.run(flow, snapshots, options, deprecatedPublicationIds, onExecutedTrace);
}
