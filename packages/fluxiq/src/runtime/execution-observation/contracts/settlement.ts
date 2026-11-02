import type { ExecutionCallbackCompletion } from "./completion.ts";

export type ExecutionCallbackSettlement = ExecutionCallbackCompletion
  | { readonly disposition: "unknown"; readonly code: string }
  | { readonly disposition: "pending"; readonly reason: "timed_out" | "callback_threw" | "observer_failed" };
