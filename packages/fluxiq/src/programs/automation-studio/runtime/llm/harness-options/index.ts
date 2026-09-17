// Barrel for the harness-option registry: the actions the exploration loop may
// take to gather information, who may add to them, and Core's own neutral set.
export {
  AUTOMATION_STUDIO_HARNESS_OPTION_LIMIT,
  automationStudioHarnessOptionIssues,
  automationStudioHarnessOptionTool,
  type AutomationStudioHarnessOption,
  type AutomationStudioHarnessOptionBundle,
  type AutomationStudioHarnessOptionExecution,
  type AutomationStudioHarnessOptionImplementation,
  type AutomationStudioHarnessOptionSafety,
  type AutomationStudioHarnessOptionSideEffect,
  type AutomationStudioHarnessOptionStage
} from "./option.ts";
export type { AutomationStudioHarnessOptionHost, AutomationStudioHarnessOptionHostContext } from "./host.ts";
export {
  AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS,
  builtinAutomationStudioHarnessOptions
} from "./builtin.ts";
export {
  AutomationStudioHarnessOptionRegistry,
  type AutomationStudioHarnessOptionLoopBinding,
  type AutomationStudioHarnessOptionResolution
} from "./registry.ts";
export {
  automationStudioHarnessInputWithDeniedEvidenceKeys,
  automationStudioHarnessOptionBundleFromBinding,
  automationStudioHarnessOptionRegistry,
  type AutomationStudioLlmEvidenceRuntimeBinding
} from "./binding.ts";
// A generated plan node that names an opaque handle, and the domain's
// resolution of every node's parameters into the ones it runs with.
export {
  AUTOMATION_STUDIO_PLAN_NODE_HANDLE_KEY,
  AUTOMATION_STUDIO_PLAN_NODE_HANDLE_LOCATION_KEY,
  automationStudioPlanNodeHandleSites,
  automationStudioPlanNodeParametersNameHandle,
  type AutomationStudioPlanNodeHandleSite
} from "./plan-node-handles.ts";
export {
  AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES,
  assertAutomationStudioFlowBootstrapPlanHandlesResolved,
  resolveAutomationStudioFlowBootstrapPlanParameters,
  type AutomationStudioFlowBootstrapPlanParameterResolution
} from "./plan-parameter-resolution.ts";
export {
  checkAutomationStudioFlowBootstrapCompletion,
  type AutomationStudioFlowBootstrapCompletionFailureCode,
  type AutomationStudioFlowBootstrapCompletionVerdict
} from "./bootstrap-completion.ts";
