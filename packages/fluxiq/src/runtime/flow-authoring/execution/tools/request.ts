import type { AutomationStudioBuildToolRequestState } from "./state.ts";

/** Only original framework requests carry their invocation's private companions. */
export class AutomationStudioBuildToolRequests {
  private static readonly values = new WeakMap<object, AutomationStudioBuildToolRequestState>();

  static of(request: object): AutomationStudioBuildToolRequestState | undefined {
    return this.values.get(request);
  }

  static bind(request: object, value: AutomationStudioBuildToolRequestState): void {
    const existing = this.values.get(request);
    if (existing && existing !== value) throw new Error("execution_observation.tool_request_already_bound");
    this.values.set(request, value);
  }

  /** An entered child may advance only the exact private state it originally read. */
  static advance(request: object, original: AutomationStudioBuildToolRequestState, value: AutomationStudioBuildToolRequestState): void {
    if (this.values.get(request) !== original || original.observer !== value.observer) throw new Error("execution_observation.tool_request_changed");
    this.values.set(request, value);
  }
}
