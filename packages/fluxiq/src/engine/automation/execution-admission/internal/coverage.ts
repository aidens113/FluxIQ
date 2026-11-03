import type { ExecutionObservationSource } from "../../../../runtime/execution-observation/index.ts";
import { automationStudioLiveRunEnvironment } from "../../../../runtime/environment/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { AutomationPureCallbacks } from "../kernel/pure.ts";
import { AutomationOrchestrationCallbacks } from "../kernel/orchestration.ts";
import { assertAutomationRecordBatchData } from "../options/index.ts";
import { automationDataProperty } from "../options/index.ts";
import { originalNativeClockFunctions, NativeClock } from "../../../../framework/clock/native/index.ts";

let loggedUnsupported = false;

function unsupported(receiver: "options" | "host", key: string): true {
  if (!loggedUnsupported) {
    loggedUnsupported = true;
    console.error("Isolated unsupported automation callback", { receiver, key });
  }
  return true;
}

/** Missing callback coverage is never an empty frontier certificate. */
export function hasUnsupportedAutomationCallbacks(options: AutomationStudioGraphExecutionOptions, source: ExecutionObservationSource): boolean {
  assertAutomationRecordBatchData(options);
  const clocks = new Set<unknown>([automationStudioLiveRunEnvironment.delay]);
  if (NativeClock.available("now")) {
    clocks.add(originalNativeClockFunctions.now);
    clocks.add(automationStudioLiveRunEnvironment.now);
  }
  if (NativeClock.available("random")) {
    clocks.add(originalNativeClockFunctions.random);
    clocks.add(automationStudioLiveRunEnvironment.random);
  }
  for (const key of ["now", "delay", "random", "startTimer", "resolveActionEffect", "classifyLegacyStepAct", "resolveTargetRefresh", "effectDispatcher", "nativeNodeExecutor", "compositeExecutor", "repairIncident", "learnInterruption"] as const) {
    const callback = automationDataProperty(options, key);
    if (typeof callback === "function" && !clocks.has(callback) && !AutomationPureCallbacks.has(options, callback) && !AutomationOrchestrationCallbacks.has(callback) && !source.isManaged({ receiver: options, callback })) return unsupported("options", key);
  }
  const host = automationDataProperty(options, "hostRuntime");
  if (!host) return false;
  for (const key of ["classifyLegacyStepAct", "observeRouteState", "signRouteState", "compareRouteSignatures", "signRouteEffect", "routeEffectHolds", "routeEffectSeen", "captureStateSnapshot", "observeRuntimeRepeat", "inspectStateDiff", "rollbackHint", "expectationEvaluator", "checkFacts", "factEvaluator", "actLanded", "checkActLanded", "waitForTarget", "reacquireTarget", "sourcePlace"] as const) {
    const callback = automationDataProperty(host, key);
    if (typeof callback === "function" && !AutomationPureCallbacks.has(host, callback) && !source.isManaged({ receiver: host, callback })) return unsupported("host", key);
  }
  return false;
}
