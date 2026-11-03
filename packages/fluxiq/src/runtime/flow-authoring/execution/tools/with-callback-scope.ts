import { AutomationStudioBuildToolRequests } from "./request.ts";

/** Runs Core composition under its original request; the body earns no completion rights. */
export async function withAutomationStudioBuildToolCallbackScope<T>(originalRequest: object, actualCoreBody: () => Promise<T>, originalCoreReceiver?: unknown): Promise<T> {
  const original = AutomationStudioBuildToolRequests.of(originalRequest);
  return original ? await original.observer.withCallbackScope(originalRequest, actualCoreBody, originalCoreReceiver) : await actualCoreBody();
}
