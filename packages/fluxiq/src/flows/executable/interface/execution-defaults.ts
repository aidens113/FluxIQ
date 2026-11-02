import type { JsonObject, JsonValue } from "../../../core/index.ts";
export type AutomationStudioFlowExecutionDefaults = {
  timeoutMs?: number;
  maxConcurrency?: number;
  /** Explicit domain grants required for a global Flow to call a domain Flow. */
  authorizedDomainIds?: string[];
  metadata?: JsonObject;
};
