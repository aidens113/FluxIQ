import { automationStudioLiveRunEnvironment } from "../../../runtime/environment/index.ts";
import { automationStudioEnvironmentExecutorOptions } from "../environment/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import { automationStudioReferenceNow } from "../../../runtime/reference-time/index.ts";
import { createIoOutputEffectDispatcher, createRuntimeOutputEffectDispatcher } from "../../../runtime/output-dispatch/index.ts";
import type { AutomationGraphOptionsInput } from "./input.ts";
export function createAutomationGraphOptions(input: AutomationGraphOptionsInput): AutomationStudioGraphExecutionOptions {
  const options: AutomationStudioGraphExecutionOptions = { inputs: input.inputs ?? {}, signal: input.signal };
  const referenceNow = automationStudioReferenceNow(input.referenceNow);
  if (referenceNow !== undefined)
    options.referenceNow = referenceNow;
  const bound = input.io;
  if (bound) {
    options.effectDispatcher = input.runtimeService
      ? createRuntimeOutputEffectDispatcher(bound.io, bound.domainId, input.runtimeService, input.targetPreparer)
      : createIoOutputEffectDispatcher(bound.io, bound.domainId, input.targetPreparer);
    options.runtimeCapabilities = ["policy-output", "io"];
    if (bound.domainId)
      options.authorizedDomainIds = input.authorizedDomainIds.filter((domainId) => domainId === bound.domainId);
  }
  const native = input.nativeNodeRuntime;
  if (native) {
    options.runtimeCapabilities = [...new Set([...(options.runtimeCapabilities ?? []), ...native.getRuntimeCapabilities()])];
    options.nativeNodeExecutor = ({ node, inputs, signal, hostContext }) => native.execute(node, inputs, signal, hostContext);
    options.resolveActionEffect = (node, parameterValues) => native.resolveActionEffect(node, parameterValues);
    options.resolveTargetRefresh = (node, parameterValues) => native.resolveTargetRefresh(node, parameterValues);
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
