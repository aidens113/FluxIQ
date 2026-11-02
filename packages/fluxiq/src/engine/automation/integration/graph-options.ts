import { automationStudioLiveRunEnvironment } from "../../../runtime/environment/index.ts";
import { automationStudioEnvironmentExecutorOptions } from "../environment/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import { automationStudioReferenceNow } from "../../../runtime/reference-time/index.ts";
import { createIoOutputEffectDispatcher, createRuntimeOutputEffectDispatcher } from "../../../runtime/output-dispatch/index.ts";
import type { AutomationGraphOptionsInput } from "./input.ts";
import { bindAutomationExecutionObservation } from "../execution-admission/index.ts";
import { AutomationNativeObservationBindings, AutomationOrchestrationCallbacks, AutomationPureCallbacks } from "../execution-admission/kernel/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../runtime/native-execution/index.ts";
export function createAutomationGraphOptions(input: AutomationGraphOptionsInput): AutomationStudioGraphExecutionOptions {
  const options: AutomationStudioGraphExecutionOptions = { inputs: input.inputs ?? {}, signal: input.signal };
  if (input.executionObservation)
    bindAutomationExecutionObservation(options, input.executionObservation);
  const referenceNow = automationStudioReferenceNow(input.referenceNow);
  if (referenceNow !== undefined)
    options.referenceNow = referenceNow;
  const bound = input.io;
  if (bound) {
    options.effectDispatcher = input.runtimeService
      ? createRuntimeOutputEffectDispatcher(bound.io, bound.domainId, input.runtimeService, input.targetPreparer)
      : createIoOutputEffectDispatcher(bound.io, bound.domainId, input.targetPreparer);
    AutomationOrchestrationCallbacks.register(options.effectDispatcher);
    options.runtimeCapabilities = ["policy-output", "io"];
    if (bound.domainId)
      options.authorizedDomainIds = input.authorizedDomainIds.filter((domainId) => domainId === bound.domainId);
  }
  const native = input.nativeNodeRuntime;
  if (native) {
    const execute = native.execute;
    const resolveActionEffect = native.resolveActionEffect;
    const resolveTargetRefresh = native.resolveTargetRefresh;
    options.runtimeCapabilities = [...new Set([...(options.runtimeCapabilities ?? []), ...native.getRuntimeCapabilities()])];
    const canonicalExecute = native instanceof AutomationStudioNativeNodeRuntime && execute === AutomationStudioNativeNodeRuntime.prototype.execute;
    options.nativeNodeExecutor = (request) => {
      const observation = canonicalExecute ? AutomationNativeObservationBindings.of(request) : undefined;
      return observation ? execute.call(native, request.node, request.inputs, request.signal, request.hostContext, observation) : execute.call(native, request.node, request.inputs, request.signal, request.hostContext);
    };
    options.resolveActionEffect = (node, parameterValues) => resolveActionEffect.call(native, node, parameterValues);
    options.resolveTargetRefresh = (node, parameterValues) => resolveTargetRefresh.call(native, node, parameterValues);
    if (canonicalExecute) AutomationOrchestrationCallbacks.register(options.nativeNodeExecutor);
    if (native instanceof AutomationStudioNativeNodeRuntime && resolveActionEffect === AutomationStudioNativeNodeRuntime.prototype.resolveActionEffect) AutomationPureCallbacks.registerLexical(options.resolveActionEffect);
    if (native instanceof AutomationStudioNativeNodeRuntime && resolveTargetRefresh === AutomationStudioNativeNodeRuntime.prototype.resolveTargetRefresh) AutomationPureCallbacks.registerLexical(options.resolveTargetRefresh);
  }
  if (input.hostRuntime)
    options.hostRuntime = input.hostRuntime;
  if (input.maxSteps !== undefined)
    options.maxSteps = input.maxSteps;
  if (input.onRecordBatch)
    options.onRecordBatch = input.onRecordBatch;
  if (input.parking)
    options.parking = input.parking;
  return automationStudioEnvironmentExecutorOptions(options, input.environment ?? automationStudioLiveRunEnvironment);
}
