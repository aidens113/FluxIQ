import type { ExecutionAdmissionAssembly, ExecutionEntry, ExecutionScope, ExecutionScopeBinding } from "../../../../../runtime/execution-admission/index.ts";
import type { OrdinaryExecutionRunBindingReader } from "../../../../../runtime/output-dispatch/admission/gateway/index.ts";
import type { AutomationStudioObservedGatewaySource } from "./gateway.ts";
export interface AutomationStudioExecutionAdmissionContinuation extends OrdinaryExecutionRunBindingReader {
    readonly assembly: ExecutionAdmissionAssembly;
    readonly scope: ExecutionScope;
    readonly binding: ExecutionScopeBinding;
    readonly gateway: AutomationStudioObservedGatewaySource;
    issueOrdinaryRunBinding(originalRoot: ExecutionEntry): Promise<object>;
    close(): Promise<void>;
}
