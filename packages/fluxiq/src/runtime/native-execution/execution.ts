import type { AutomationNodeExecutionResult, AutomationNodePort } from "../../components/automation/index.ts";
import type { AutomationStudioNativeLogEntry } from "../automation-host/index.ts";
/**
 * What one native execution answered. `declaredOutputs` is the bound
 * definition's output ports, given beside a result the implementation produced:
 * the executor checks a route its dispatch answers against them
 * (`executor/node-execution.ts`), and an importer definition lives only here,
 * never in the builtin library the executor otherwise reads.
 */
export type AutomationStudioNativeExecution = {
  result: AutomationNodeExecutionResult;
  logs: AutomationStudioNativeLogEntry[];
  declaredOutputs?: readonly AutomationNodePort[];
};
