import { runtimeActivityPresentationStorage } from "./storage.ts";

/** Presentation failures cannot change the result of executable work. */
export function invokeRuntimeActivityPresentation(operation: string, args: readonly unknown[]): unknown {
  try { return runtimeActivityPresentationStorage.getStore()?.invoke(operation, args); }
  catch { return { kind: "presentation_unavailable", reason: "adapter_error" }; }
}
