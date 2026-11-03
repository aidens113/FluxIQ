import { AutomationStudioBuildToolRequests } from "./request.ts";

/** A data copy forwards only its original request's already private companion. */
export function inheritAutomationStudioBuildToolRequest(source: object, target: object): void {
  const original = AutomationStudioBuildToolRequests.of(source);
  if (original) AutomationStudioBuildToolRequests.bind(target, original);
}
