import type { AutomationStudioNativeNodeImplementation } from "../../../components/automation/importer/index.ts";
import type { AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
import type { ExecutionCallbackOutcome, ExecutionCallbackSettlement } from "../../execution-observation/index.ts";

export type NativeManagedCompletionRegistration = {
  readonly implementation: AutomationStudioNativeNodeImplementation;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly definitionId: string;
  readonly definitionVersion: string;
} & (
  | { readonly contract: "no_direct_effects" }
  | { readonly contract: "managed_direct_effects"; consumeCompletion(input: { readonly invocation: object; readonly outcome: ExecutionCallbackOutcome<AutomationNodeExecutionResult> }): ExecutionCallbackSettlement | null }
);
