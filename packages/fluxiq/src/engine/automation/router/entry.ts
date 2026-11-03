import type { AutomationStudioRouterExecutionResult } from "../../../flows/authoring/routing/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import { automationCallbackObservation, invokeAutomationFrame, prepareAutomationFrame, registerAutomationExecutionKernel } from "../execution-admission/kernel/index.ts";
import { routeAutomationStudioRun } from "./state/index.ts";

type RoutingInput = Parameters<typeof routeAutomationStudioRun>[0];
const routingKernel = registerAutomationExecutionKernel(undefined, routeBody, "children");

/** Enter routing on the caller's configured engine; unbound options retain legacy behavior. */
export async function routeAutomationStudioRunWithOptions(input: RoutingInput, options: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioRouterExecutionResult> {
  const frame = await prepareAutomationFrame(options, { receiver: undefined, callback: routeBody }, routingKernel);
  if (!frame) return await routeBody(input, options);
  return await invokeAutomationFrame(frame, { receiver: undefined, callback: routeBody, args: [input, frame.options] });
}

async function routeBody(input: RoutingInput, options: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioRouterExecutionResult> {
  return await routeAutomationStudioRun(input, automationCallbackObservation(options));
}
