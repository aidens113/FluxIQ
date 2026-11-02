import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";

/** Graph arrival objects are engine-owned, absent from executable/model data. */
export class AutomationRetrySeries {
  private static readonly originals = new WeakMap<object, object>();

  static bind(options: AutomationStudioGraphExecutionOptions, originalInvocation: object): void {
    this.originals.set(options, originalInvocation);
  }

  static inherit(source: AutomationStudioGraphExecutionOptions, target: AutomationStudioGraphExecutionOptions): void {
    const original = this.originals.get(source);
    if (original) this.originals.set(target, original);
  }

  static original(options: AutomationStudioGraphExecutionOptions): object {
    return this.originals.get(options) ?? options;
  }
}
