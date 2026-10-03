// The post-run check's look at the page a run ended on, through the bound domain.
//
// The check's `readEndView` port (`../../result-verification/run-outcome.ts`),
// as the service sets it: the domain's free look (`./look.ts`), sent for the
// run's own project and Flow. No run stands behind the check any more, so the
// look goes under the check that permits nothing gated
// (`automationStudioActionPermissionDenied`): a domain that looks needs no
// permission, and one that would do something lasting is refused. No start
// location is sent: the run already reached it.

import { automationStudioActionPermissionDenied } from "../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, type AutomationStudioLlmEvidenceRuntimeBinding } from "../../llm/index.ts";
import type { AutomationStudioResultVerificationPorts } from "../../result-verification/index.ts";
import { automationStudioEndViewLook } from "./look.ts";

/** The port, or nothing when the bound domain declares no free look or no view keys. */
export function automationStudioRunEndViewReader(
  binding: AutomationStudioLlmEvidenceRuntimeBinding | undefined,
  options: { timeoutMs?: number } = {}
): AutomationStudioResultVerificationPorts["readEndView"] {
  if (!binding) return undefined;
  const initial = binding.runsNodes?.initial;
  // The domain's own tools first, then the library's look, in the order a build offers them (`../../llm/harness-options/binding.ts`).
  const tools = [...binding.tools, ...(initial ? [{ toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, initialObservation: { input: initial } }] : [])];
  const look = automationStudioEndViewLook({ tools, viewKeys: binding.observedStateKeys, ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) });
  if (!look) return undefined;
  return async ({ projectId, runId, flowId }) => await look({
    callId: `result-check.end-view.${runId}`,
    executeTool: (call) => binding.executeTool({ projectId, flowId, ...call, permission: automationStudioActionPermissionDenied })
  });
}
