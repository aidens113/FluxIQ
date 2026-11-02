import type { AutomationNodeExecutionResult } from "../../contracts.ts";
import type { AutomationStudioNativeNodeContext } from "./context.ts";
export type AutomationStudioNativeNodeImplementation = (context: AutomationStudioNativeNodeContext) => AutomationNodeExecutionResult | Promise<AutomationNodeExecutionResult>;
