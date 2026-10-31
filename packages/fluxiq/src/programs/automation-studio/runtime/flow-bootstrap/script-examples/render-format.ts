import {
  AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT,
  AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE,
  AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT,
  AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT
} from "../plan/flow-script-format.ts";
import type { AutomationStudioFlowScriptExamples } from "./contracts.ts";
import { renderAutomationStudioFlowScriptExamples } from "./render.ts";

/** Render Core's grammar with only the worked examples this client supplied. */
export function renderAutomationStudioFlowScriptFormat(examples?: AutomationStudioFlowScriptExamples) {
  return renderAutomationStudioFlowScriptExamples({
    format: AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT,
    act: AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE,
    loop: AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT,
    state: AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT
  }, examples);
}
