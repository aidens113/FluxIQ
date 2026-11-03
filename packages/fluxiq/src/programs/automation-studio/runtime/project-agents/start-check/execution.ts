import { AutomationStudioBuildToolFactories, invokeAutomationStudioBuildToolCallback } from "../../../../../runtime/flow-authoring/execution/tools/forwarding/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";

/** The Core reader delegates to the original loop under the same entered callback. */
export function automationStudioProjectBuildReadExecution(loop: Pick<AutomationStudioLlmEvidenceLoopInput, "executeTool">): AutomationStudioLlmEvidenceLoopInput["executeTool"] {
  const callback = loop.executeTool;
  const execute: AutomationStudioLlmEvidenceLoopInput["executeTool"] = async call => await invokeAutomationStudioBuildToolCallback(call, { receiver: loop, callback, args: [call] }, call.signal);
  AutomationStudioBuildToolFactories.remember(execute, "frame");
  return execute;
}
