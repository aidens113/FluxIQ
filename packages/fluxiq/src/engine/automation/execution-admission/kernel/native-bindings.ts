import type { NativeExecutionObservation } from "../../../../runtime/native-execution/admission/index.ts";

export class AutomationNativeObservationBindings {
  private static readonly values = new WeakMap<object, NativeExecutionObservation>();

  static bind(request: object, observation: NativeExecutionObservation): void {
    this.values.set(request, observation);
  }

  static of(request: object): NativeExecutionObservation | undefined {
    return this.values.get(request);
  }
}
