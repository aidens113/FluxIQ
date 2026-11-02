import type { ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";
import { AutomationStudioSiteResetObservation, invokeAutomationStudioSiteResetCallback } from "../../flow-bootstrap/reset-observation/index.ts";
import type { AutomationStudioProjectWriteCompletion } from "./owner.ts";

/** Retains the captured queued parent while the original supplied callback runs. */
export async function invokeAutomationStudioProjectWriteCallback<TReceiver, TArguments extends unknown[], TResult>(
  frame: ReturnType<typeof AutomationStudioProjectWriteCompletion.capture>,
  call: ExecutionCallbackCall<TReceiver, TArguments, TResult>,
  childInvocation?: object
): Promise<Awaited<TResult>> {
  const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments };
  if (!frame) return await pinned.callback.apply(pinned.receiver, pinned.args);
  const carrier = Object.freeze({});
  const scope = new AutomationStudioSiteResetObservation(carrier, frame.context, frame.options);
  try { return await invokeAutomationStudioSiteResetCallback(carrier, pinned, undefined, childInvocation); }
  finally { scope.close(); }
}
