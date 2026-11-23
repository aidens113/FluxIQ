import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import { automationStudioProcessingInputs, resolveAutomationNodeParameterValues } from "../../../components/automation/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../index.ts";
import { automationStudioNodeOutputReferences, collectNodeInputs } from "../graph-navigation/index.ts";

/** The same original parameter resolution for an attempt and its identity refresh. */
export function automationStudioRefreshInputs(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode, values: Record<string, JsonValue>, options: AutomationStudioGraphExecutionOptions, variables: ReadonlyMap<string, JsonValue>) {
  const inputs = collectNodeInputs(flow, node, values);
  const authored = automationStudioNodeOutputReferences(flow, node.parameterValues ?? {});
  const rawOutput = authored.recordOutput;
  const output = rawOutput && typeof rawOutput === "object" && !Array.isArray(rawOutput) ? rawOutput : undefined;
  const process = output?.process;
  const automatic = process && typeof process === "object" && !Array.isArray(process) && Object.hasOwn(process, "declaration");
  const current = automatic ? automationStudioProcessingInputs({ process, schema: output?.schema, inputs: options.inputs }) : undefined;
  if (current && !current.ok) return { inputs, authored, values: authored, missingPaths: current.missingPaths, processingIssues: current.issues };
  const parameters = current?.ok ? { ...authored, recordOutput: { ...output, process: current.process } } : authored;
  const resolved = resolveAutomationNodeParameterValues(parameters, { ...(options.inputs ?? {}), ...Object.fromEntries(variables), ...values, ...inputs });
  return { inputs, authored, ...resolved };
}
