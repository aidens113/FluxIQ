import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import { resolveAutomationNodeParameterValues } from "../../../components/automation/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../index.ts";
import { automationStudioNodeOutputReferences, collectNodeInputs } from "../graph-navigation/index.ts";

/** The same original parameter resolution for an attempt and its identity refresh. */
export function automationStudioRefreshInputs(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode, values: Record<string, JsonValue>, options: AutomationStudioGraphExecutionOptions, variables: ReadonlyMap<string, JsonValue>) {
  const inputs = collectNodeInputs(flow, node, values);
  const authored = automationStudioNodeOutputReferences(flow, node.parameterValues ?? {});
  const resolved = resolveAutomationNodeParameterValues(authored, { ...(options.inputs ?? {}), ...Object.fromEntries(variables), ...values, ...inputs });
  return { inputs, authored, ...resolved };
}
