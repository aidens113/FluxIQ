import { automationStudioLiveRunEnvironment } from "../../../runtime/environment/index.ts";
import { automationStudioEnvironmentExecutorOptions } from "../environment/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import { automationStudioReferenceNow } from "../../../runtime/reference-time/index.ts";
import { createIoOutputEffectDispatcher, createRuntimeOutputEffectDispatcher } from "../../../runtime/output-dispatch/index.ts";
import type { AutomationGraphOptionsInput } from "./input.ts";
import { bindAutomationExecutionObservation } from "../execution-admission/index.ts";
import { AutomationNativeObservationBindings, AutomationOrchestrationCallbacks, AutomationPureCallbacks, automationExecutionProperty, hasAutomationCallbackFrame, invokeAutomationCallbackSync } from "../execution-admission/kernel/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../runtime/native-execution/index.ts";
import { executionDataProperty } from "../../../runtime/execution-observation/index.ts";

const nativeMethods = Object.freeze({
  execute: executionDataProperty(AutomationStudioNativeNodeRuntime.prototype, "execute"),
  resolveActionEffect: executionDataProperty(AutomationStudioNativeNodeRuntime.prototype, "resolveActionEffect"),
  resolveTargetRefresh: executionDataProperty(AutomationStudioNativeNodeRuntime.prototype, "resolveTargetRefresh"),
  getRuntimeCapabilities: executionDataProperty(AutomationStudioNativeNodeRuntime.prototype, "getRuntimeCapabilities")
});

export function createAutomationGraphOptions(input: AutomationGraphOptionsInput): AutomationStudioGraphExecutionOptions {
  const options: AutomationStudioGraphExecutionOptions = { inputs: input.inputs ?? {}, signal: input.signal };
  const observation = executionDataProperty(input, "executionObservation");
  if (observation) bindAutomationExecutionObservation(options, observation);
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
  const native = automationExecutionProperty(options, input, "nativeNodeRuntime");
  if (native) {
    const execute = automationExecutionProperty(options, native, "execute");
    const resolveActionEffect = automationExecutionProperty(options, native, "resolveActionEffect");
    const resolveTargetRefresh = automationExecutionProperty(options, native, "resolveTargetRefresh");
    const getRuntimeCapabilities = automationExecutionProperty(options, native, "getRuntimeCapabilities");
    const readCapabilities = () => getRuntimeCapabilities.call(native);
    const canonicalCapabilities = native instanceof AutomationStudioNativeNodeRuntime && getRuntimeCapabilities === nativeMethods.getRuntimeCapabilities;
    if (canonicalCapabilities) AutomationPureCallbacks.registerLexical(readCapabilities);
    const capabilities = hasAutomationCallbackFrame(options)
      ? canonicalCapabilities
        ? invokeAutomationCallbackSync(options, { receiver: undefined, callback: readCapabilities, args: [] })
        : invokeAutomationCallbackSync(options, { receiver: native, callback: getRuntimeCapabilities, args: [] })
      : readCapabilities();
    options.runtimeCapabilities = [...new Set([...(options.runtimeCapabilities ?? []), ...capabilities])];
    const canonicalExecute = native instanceof AutomationStudioNativeNodeRuntime && execute === nativeMethods.execute;
    options.nativeNodeExecutor = (request) => {
      const observation = canonicalExecute ? AutomationNativeObservationBindings.of(request) : undefined;
      return observation ? execute.call(native, request.node, request.inputs, request.signal, request.hostContext, observation) : execute.call(native, request.node, request.inputs, request.signal, request.hostContext);
    };
    options.resolveActionEffect = (node, parameterValues) => resolveActionEffect.call(native, node, parameterValues);
    options.resolveTargetRefresh = (node, parameterValues) => resolveTargetRefresh.call(native, node, parameterValues);
    if (canonicalExecute) AutomationOrchestrationCallbacks.register(options.nativeNodeExecutor);
    if (native instanceof AutomationStudioNativeNodeRuntime && resolveActionEffect === nativeMethods.resolveActionEffect) AutomationPureCallbacks.registerLexical(options.resolveActionEffect);
    if (native instanceof AutomationStudioNativeNodeRuntime && resolveTargetRefresh === nativeMethods.resolveTargetRefresh) AutomationPureCallbacks.registerLexical(options.resolveTargetRefresh);
  }
  const hostRuntime = automationExecutionProperty(options, input, "hostRuntime");
  if (hostRuntime) options.hostRuntime = hostRuntime;
  if (input.maxSteps !== undefined)
    options.maxSteps = input.maxSteps;
  const onRecordBatch = automationExecutionProperty(options, input, "onRecordBatch");
  if (onRecordBatch) options.onRecordBatch = onRecordBatch;
  const parking = automationExecutionProperty(options, input, "parking");
  if (parking) options.parking = parking;
  return automationStudioEnvironmentExecutorOptions(options, automationExecutionProperty(options, input, "environment") ?? automationStudioLiveRunEnvironment);
}
