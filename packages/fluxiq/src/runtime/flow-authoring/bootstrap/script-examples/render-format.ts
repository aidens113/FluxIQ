import {
  AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT,
  AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT,
  AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT
} from "../plan/flow-script-format.ts";
import { renderAutomationStudioFlowScriptAct, type AutomationStudioFlowScriptGuidance } from "../script-guidance/index.ts";
import type { AutomationStudioFlowScriptExamples } from "./contracts.ts";
import { renderAutomationStudioFlowScriptExamples } from "./render.ts";

/** Render Core's grammar with only the worked examples this client supplied. */
export function renderAutomationStudioFlowScriptFormat(examples?: AutomationStudioFlowScriptExamples, guidance?: AutomationStudioFlowScriptGuidance) {
  return renderAutomationStudioFlowScriptExamples({
    format: AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT,
    act: renderAutomationStudioFlowScriptAct(guidance),
    loop: AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT,
    state: AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT
  }, examples);
}
