import type { AutomationStudioParkingPort } from "../../parking/index.ts";
import { AutomationStudioBuildToolAuxiliaryCalls } from "./auxiliary-calls.ts";

/** One question pins its real port methods and retains each original auxiliary call across retries. */
export function observeAutomationStudioBuildToolParkingPort(originalRequest: object, originalPort: AutomationStudioParkingPort): AutomationStudioParkingPort {
  const open = originalPort.open;
  const awaitAnswer = originalPort.awaitAnswer;
  const opening = AutomationStudioBuildToolAuxiliaryCalls.create(originalRequest);
  const answering = AutomationStudioBuildToolAuxiliaryCalls.create(originalRequest);
  return {
    open: ask => AutomationStudioBuildToolAuxiliaryCalls.invoke(opening, { receiver: originalPort, callback: open, args: [ask] }),
    ...(awaitAnswer ? { awaitAnswer: (ask, wait) => AutomationStudioBuildToolAuxiliaryCalls.invoke(answering, { receiver: originalPort, callback: awaitAnswer, args: [ask, wait] }, wait.signal) } satisfies Pick<AutomationStudioParkingPort, "awaitAnswer"> : {})
  };
}
