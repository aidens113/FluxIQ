import { automationStudioFlowSettingsFingerprint } from "../flow-settings/index.ts";
import type { AutomationStudioFlowExecutionBinding } from "./binding.ts";
import type { AutomationStudioFlowExecutionBindingPorts } from "./ports.ts";

export async function resolveAutomationStudioFlowExecutionBinding(
  ports: AutomationStudioFlowExecutionBindingPorts,
  projectId: string,
  flowId: string
): Promise<AutomationStudioFlowExecutionBinding> {
  const [flow, executionDigest] = await Promise.all([
    ports.getFlow(projectId, flowId),
    ports.getExecutionDigest(projectId, flowId)
  ]);
  const settingsRevision = ports.canonicalSettingsRevision
    ? await ports.canonicalSettingsRevision(projectId, flowId)
    : automationStudioFlowSettingsFingerprint(flow);
  return { executionDigest, settingsRevision };
}
