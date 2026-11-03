import type { ExecutableRouterExecutionInput } from "../../../executable/routing/index.ts";
import type { AutomationStudioAdaptationPolicy } from "../../adaptation-policy/index.ts";
import type { AutomationStudioFlowRouter } from "../router.ts";
import type { AutomationStudioFlowSubflow } from "../subflow.ts";

export type AutomationStudioRouterExecutionInput = Omit<ExecutableRouterExecutionInput<AutomationStudioFlowRouter, AutomationStudioFlowSubflow>, "adaptationPolicy"> & { adaptationPolicy?: AutomationStudioAdaptationPolicy };
