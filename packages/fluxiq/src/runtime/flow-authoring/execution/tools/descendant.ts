import { AutomationStudioBuildToolRequests } from "./request.ts";

/** Only an actual settled delegate may continue as an internal call of its open Core frame. */
export function inheritAutomationStudioBuildToolDescendant(originalRequest: object, freshRequest: object): void {
  const original = AutomationStudioBuildToolRequests.of(originalRequest);
  if (original) original.observer.bindDescendant(originalRequest, freshRequest);
}
