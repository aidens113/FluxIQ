import type { AuthoringExecutionContext as PartialTrialContext } from "../observation/index.ts";
import { AuthoringExecutionScope as AutomationStudioSiteResetObservation } from "../observation/index.ts";
import { AutomationStudioBuildToolRequests } from "./request.ts";
import { AutomationStudioBuildToolCallbackContexts } from "./callback-context.ts";

/** Private Core-frame handoff; it grants no callback contract or completion. */
export class AutomationStudioBuildToolCallbackScope {
  private readonly scopes: AutomationStudioSiteResetObservation[] = [];
  private readonly companions: Array<() => void> = [];
  private closed = false;

  private constructor() {}

  static open(originalRequest: object, originalCoreReceiver?: unknown): AutomationStudioBuildToolCallbackScope | undefined {
    const original = AutomationStudioBuildToolRequests.of(originalRequest);
    const context = original?.observer.callbackContext(originalRequest);
    if (!context) return undefined;
    const frame = new AutomationStudioBuildToolCallbackScope();
    try {
      for (const target of AutomationStudioSiteResetObservation.targets(originalCoreReceiver, originalRequest)) {
        const previous = AutomationStudioSiteResetObservation.of(target);
        if (previous && (previous.context.callbacks !== context.callbacks || previous.context.parent.reservation !== context.parent.reservation || (previous.context.toolObserver && previous.context.toolObserver !== context.toolObserver))) {
          throw new Error("execution_observation.foreign_tool_callback_scope");
        }
        const child: PartialTrialContext = {
          ...context,
          ...previous?.context,
          parent: context.parent,
          callbacks: context.callbacks,
          toolObserver: context.toolObserver,
          toolRequest: originalRequest
        };
        frame.scopes.push(new AutomationStudioSiteResetObservation(target, child, previous?.options ?? originalRequest, previous));
        frame.companions.push(AutomationStudioBuildToolCallbackContexts.bind(target, originalRequest));
      }
    } catch (error) {
      try {
        frame.close();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Tool callback scope setup and restoration failed.");
      }
      throw error;
    }
    return frame;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const errors: unknown[] = [];
    for (const scope of this.scopes.reverse()) {
      try {
        scope.close();
      } catch (error) {
        errors.push(error);
      }
    }
    for (const restore of this.companions.reverse()) {
      try {
        restore();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Tool callback scope restoration failed.");
  }
}
