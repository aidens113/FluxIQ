import type { ExecutionObservationSource } from "../../../../runtime/execution-observation/index.ts";
import { automationStudioLiveRunEnvironment } from "../../../../runtime/environment/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { AutomationPureCallbacks } from "../kernel/pure.ts";
import { AutomationOrchestrationCallbacks } from "../kernel/orchestration.ts";

/** Missing callback coverage is never an empty frontier certificate. */
export function hasUnsupportedAutomationCallbacks(options: AutomationStudioGraphExecutionOptions, source: ExecutionObservationSource): boolean {
  const clocks = new Set<object>([automationStudioLiveRunEnvironment.now, automationStudioLiveRunEnvironment.delay, automationStudioLiveRunEnvironment.random, Date.now, Math.random]);
  const record = options as Readonly<Record<string, unknown>>;
  for (const key of ["now", "delay", "random", "startTimer", "resolveActionEffect", "classifyLegacyStepAct", "resolveTargetRefresh", "effectDispatcher", "nativeNodeExecutor", "compositeExecutor", "onRecordBatch", "repairIncident", "learnInterruption"]) {
    const callback = record[key];
    if (typeof callback === "function" && !clocks.has(callback) && !AutomationPureCallbacks.has(options, callback) && !AutomationOrchestrationCallbacks.has(callback) && !source.isManaged({ receiver: options, callback })) return true;
  }
  const host = options.hostRuntime;
  if (!host) return false;
  for (const key of ["classifyLegacyStepAct", "observeRouteState", "signRouteState", "compareRouteSignatures", "signRouteEffect", "routeEffectHolds", "routeEffectSeen", "captureStateSnapshot", "observeRuntimeRepeat", "inspectStateDiff", "rollbackHint", "expectationEvaluator", "checkFacts", "factEvaluator", "actLanded", "checkActLanded", "waitForTarget", "reacquireTarget", "sourcePlace"]) {
    const callback = Reflect.get(host, key);
    if (typeof callback === "function" && !AutomationPureCallbacks.has(host, callback) && !source.isManaged({ receiver: host, callback })) return true;
  }
  return false;
}
