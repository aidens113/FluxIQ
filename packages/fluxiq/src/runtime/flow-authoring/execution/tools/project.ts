import type { AutomationStudioBuildToolObserver } from "./observer.ts";

/** The original project and trial environment share their early configured producer. */
export class AutomationStudioProjectBuildToolObservers {
  private static readonly values = new WeakMap<object, AutomationStudioBuildToolObserver>();

  static bind(original: object, observer: AutomationStudioBuildToolObserver): void {
    const existing = this.values.get(original);
    if (existing && existing !== observer) throw new Error("execution_observation.project_tool_observer_already_bound");
    this.values.set(original, observer);
  }

  static of(original: object): AutomationStudioBuildToolObserver | undefined {
    return this.values.get(original);
  }
}
