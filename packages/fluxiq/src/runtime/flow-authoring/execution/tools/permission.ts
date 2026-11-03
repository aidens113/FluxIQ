import { AuthoringExecutionScope, withAuthoringExecutionScope } from "../observation/index.ts";
import type { AutomationStudioBuildToolRequestState } from "./state.ts";
import { AutomationStudioBuildToolRequests } from "./request.ts";
import { AutomationStudioBuildToolCallbackContexts } from "./callback-context.ts";

/** Original Core permission closures follow their actual raw invocation through private copies. */
export class AutomationStudioBuildToolPermissions {
  static bind(request: object, callback: object): void {
    const original = AutomationStudioBuildToolRequests.of(request);
    if (!original) return;
    if (original.kind === "preparing" || typeof callback !== "function") throw new Error("execution_observation.permission_origin_missing");
    const permission: NonNullable<AutomationStudioBuildToolRequestState["permission"]> = Object.seal({ callback, originalRequest: request, entered: false, series: undefined });
    AutomationStudioBuildToolRequests.advance(request, original, { ...original, permission });
  }

  static validate(request: object, original: AutomationStudioBuildToolRequestState, series: AutomationStudioBuildToolRequestState["series"]): void {
    const permission = original.permission;
    if (!permission) return;
    const origin = AutomationStudioBuildToolRequests.of(permission.originalRequest);
    const descriptor = Object.getOwnPropertyDescriptor(request, "permission");
    if (!origin || origin.kind === "preparing" || original.kind === "preparing" || origin.permission !== permission || origin.observer !== original.observer || origin.run !== original.run || origin.parent.reservation !== original.parent.reservation || (origin.role !== "scope" && origin.series !== series) || (permission.series && permission.series !== series) || !descriptor || !("value" in descriptor) || descriptor.value !== permission.callback) {
      throw new Error("execution_observation.foreign_raw_permission");
    }
  }

  static enter(request: object, active: AutomationStudioBuildToolRequestState): (() => void) | undefined {
    const permission = active.permission;
    if (!permission) return undefined;
    this.validate(request, active, active.series);
    if (active.kind !== "active" || AutomationStudioBuildToolRequests.of(request) !== active || AutomationStudioBuildToolCallbackContexts.request(permission.callback)) throw new Error("execution_observation.raw_permission_already_active");
    permission.entered = true;
    permission.series = active.series;
    return AutomationStudioBuildToolCallbackContexts.bind(permission.callback, request);
  }

  static async withScope<T>(callback: object, originalRequest: object, receiver: object, originalCall: object, body: () => Promise<T>): Promise<T> {
    const origin = AutomationStudioBuildToolRequests.of(originalRequest);
    const permission = origin?.permission;
    if (!origin || !permission) {
      if (origin || AuthoringExecutionScope.of(receiver)?.context.toolObserver) throw new Error("execution_observation.raw_permission_scope_required");
      return await body();
    }
    if (permission.callback !== callback || permission.originalRequest !== originalRequest || origin.kind === "preparing") throw new Error("execution_observation.foreign_raw_permission");
    const rawRequest = AutomationStudioBuildToolCallbackContexts.request(callback);
    if (!rawRequest) {
      if (permission.entered) throw new Error("execution_observation.raw_permission_scope_required");
      const current = AuthoringExecutionScope.of(originalRequest) ?? AuthoringExecutionScope.of(receiver);
      const expected = origin.observer.callbackContext(originalRequest);
      if (!current || !expected || current.context.callbacks !== expected.callbacks || current.context.parent !== expected.parent) throw new Error("execution_observation.raw_permission_scope_required");
      return await withAuthoringExecutionScope(current, [receiver, originalCall], body);
    }
    const active = AutomationStudioBuildToolRequests.of(rawRequest);
    if (!active || active.kind !== "active" || active.permission !== permission || active.observer !== origin.observer || active.run !== origin.run || active.series !== permission.series) throw new Error("execution_observation.foreign_raw_permission");
    return await active.observer.withCallbackScope(rawRequest, async () => {
      const current = AuthoringExecutionScope.of(receiver);
      if (!current || current.context.parent !== active.parent || current.context.toolRequest !== rawRequest) throw new Error("execution_observation.raw_permission_scope_required");
      return await withAuthoringExecutionScope(current, [originalCall], body);
    }, receiver);
  }
}
