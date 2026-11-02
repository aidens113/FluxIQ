import type { AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
import type { ExecutionObservationContext } from "../../execution-admission/index.ts";
import type { ExecutionCallbackCompletionState } from "../../execution-observation/index.ts";
import type { NativeObservedPending } from "./pending.ts";

export class NativeInvocationResults {
  private static readonly executing = new WeakMap<Promise<AutomationNodeExecutionResult>, NativeObservedPending>();
  private static readonly returned = new WeakMap<object, NativeObservedPending>();
  static start(execution: Promise<AutomationNodeExecutionResult>, pending: NativeObservedPending): void { this.executing.set(execution, pending); }
  static bind<T extends object>(execution: Promise<AutomationNodeExecutionResult>, result: T): T {
    const pending = this.executing.get(execution);
    if (!pending) throw new Error("execution_observation.foreign_native_execution");
    this.returned.set(result, pending);
    return result;
  }
  static read(result: object, parent: ExecutionObservationContext): ExecutionCallbackCompletionState | undefined {
    const pending = this.returned.get(result);
    if (!pending || pending.parent.parent !== parent.parent || pending.parent.reservation !== parent.reservation) return undefined;
    return pending.invocation ? pending.state.source.completion(pending.invocation) : "pending";
  }
}
