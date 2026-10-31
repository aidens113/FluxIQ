import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { resolveAutomationNodeParameterValues } from "../../../nodes/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts.ts";
import { automationStudioNodeOutputReferences, collectNodeInputs } from "../node-inputs.ts";

/** The same original parameter resolution for an attempt and its identity refresh. */
export function automationStudioRefreshInputs(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode, values: Record<string, JsonValue>, options: AutomationStudioGraphExecutionOptions, variables: ReadonlyMap<string, JsonValue>) {
  const inputs = collectNodeInputs(flow, node, values);
  const authored = automationStudioNodeOutputReferences(flow, node.parameterValues ?? {});
  const resolved = resolveAutomationNodeParameterValues(authored, { ...(options.inputs ?? {}), ...Object.fromEntries(variables), ...values, ...inputs });
  return { inputs, authored, ...resolved };
}
