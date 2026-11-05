import { isAutomationNodeParameterStateBinding } from "../../../components/automation/index.ts";
import type { AutomationStudioPartCallee } from "./types.ts";
import type { AutomationStudioPartStep } from "./steps.ts";

/**
 * The part a call step runs, from the Subflow id it names or the `{partId,
 * version}` pin it carries. Undefined when it names neither by a literal (a
 * bound target cannot be known before a run) or names one this part was not
 * given: a part whose call cannot be read is not saved.
 */
export function partCalleeOf(step: AutomationStudioPartStep, callees: Readonly<Record<string, AutomationStudioPartCallee>>): AutomationStudioPartCallee | undefined {
  const subflowId = step.node.parameterValues?.subflowId;
  if (typeof subflowId === "string" && !isAutomationNodeParameterStateBinding(subflowId)) return Object.hasOwn(callees, subflowId) ? callees[subflowId] : undefined;
  const pin = step.node.parameterValues?.part;
  if (!pin || typeof pin !== "object" || Array.isArray(pin) || isAutomationNodeParameterStateBinding(pin)) return undefined;
  const { partId, version } = pin;
  if (typeof partId !== "string" || typeof version !== "number") return undefined;
  const key = `${partId}@${version}`;
  return Object.hasOwn(callees, key) ? callees[key] : undefined;
}
