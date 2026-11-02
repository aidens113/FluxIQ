import type { AutomationExecutionKernel } from "./handle.ts";

/** Only actual engine modules register trusted kernel methods; never exported publicly. */
export class AutomationKernelState {
  private static readonly kernels = new WeakMap<object, { readonly receiver: unknown; readonly callback: object; readonly kind: "graph" | "attempt" | "children" }>();
  static create<TReceiver, TArguments extends unknown[], TResult>(receiver: TReceiver, callback: (this: TReceiver, ...args: TArguments) => TResult, kind: "graph" | "attempt" | "children"): AutomationExecutionKernel {
    const kernel = Object.freeze({}) as AutomationExecutionKernel;
    this.kernels.set(kernel, { receiver, callback, kind });
    return kernel;
  }
  static read(kernel: AutomationExecutionKernel) {
    const state = this.kernels.get(kernel);
    if (!state) throw new Error("execution_observation.foreign_kernel");
    return state;
  }
}
