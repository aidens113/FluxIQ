import { createAutomationExecutionAdmissionSource } from "../../../../engine/automation/execution-admission/index.ts";
import { ExecutionObservationSource, ExecutionCallbackRootSource, type ExecutionCallbackCompletionPolicy, type ExecutionCallbackRegistrar } from "../../../../runtime/execution-observation/index.ts";
import { createNativeExecutionAdmissionSource, type NativeManagedCompletionRegistration } from "../../../../runtime/native-execution/admission/index.ts";
import { createOutputExecutionAdmissionSource, type OutputGatewayTarget } from "../../../../runtime/output-dispatch/admission/index.ts";
import { AutomationStudioCandidateTrialSource } from "../candidate-trials/authority/index.ts";
import type { AutomationStudioExecutionAdmissionController, AutomationStudioExecutionAdmissionOptions } from "../service/execution-admission/index.ts";
import { createAutomationStudioBuildToolObserver } from "../../../../runtime/flow-authoring/execution/tools/index.ts";

/** One complete configured source cohort, before any build tool or trial can reserve. */
export async function createAutomationStudioBuildExecution(
  controller: AutomationStudioExecutionAdmissionController,
  options: AutomationStudioExecutionAdmissionOptions,
  nativeRuntime?: object,
  gatewayTargets: readonly OutputGatewayTarget[] = [],
  nativeCompletions: readonly NativeManagedCompletionRegistration[] = [],
  callbackCompletions: readonly ExecutionCallbackCompletionPolicy[] = []
) {
  const continuation = await controller.open(options);
  try {
    const { assembly, scope, gateway } = continuation;
    const callbacks = new ExecutionObservationSource(scope, "studio.build.callbacks");
    const native = createNativeExecutionAdmissionSource(scope, nativeRuntime, nativeCompletions);
    const output = createOutputExecutionAdmissionSource(scope, { gateway, gatewayTargets });
    const automation = createAutomationExecutionAdmissionSource(scope, { native, output });
    const callbackRegistrar: ExecutionCallbackRegistrar = { manage: registration => callbacks.manage(registration) };
    const automationRegistrar: ExecutionCallbackRegistrar = { manage: registration => automation.manage(registration) };
    for (const policy of callbackCompletions) {
      policy.apply(Object.freeze(callbackRegistrar));
      policy.apply(Object.freeze(automationRegistrar));
    }
    const tools = new ExecutionCallbackRootSource(scope, assembly.consumer, callbacks, "studio.build.tools");
    const toolObserver = createAutomationStudioBuildToolObserver({ scope, roots: tools, callbacks, runBindings: continuation });
    const trials = new AutomationStudioCandidateTrialSource({ scope, consumer: assembly.consumer, seriesKey: continuation.binding.continuationKey, callbacks, automation, toolObserver });
    gateway.setProvenanceReader(output.provenanceReader);
    native.connect(assembly.registerSource(native.registration([])));
    output.connect(assembly.registerSource(output.registration([output.owner, gateway.owner])));
    automation.connect(assembly.registerSource(automation.registration([automation.owner, native.owner, output.owner])));
    callbacks.connect(assembly.registerSource(callbacks.registration([callbacks.owner, automation.owner, native.owner, output.owner])));
    gateway.connect(assembly.registerSource(gateway.registration([])));
    trials.connect(assembly.registerSource(trials.registration([callbacks.owner])));
    tools.connect(assembly.registerSource(tools.registration([callbacks.owner])));
    return Object.freeze({ continuation, callbacks, native, output, automation, trials, tools, toolObserver });
  } catch (error) {
    try { await continuation.close(); }
    catch (closeError) { throw new AggregateError([error, closeError], "execution_admission.build_configuration_failed"); }
    throw error;
  }
}
