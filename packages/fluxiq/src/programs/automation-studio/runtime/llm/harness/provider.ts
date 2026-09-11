import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmTaskRequest } from "./task-request.ts";

export type AutomationStudioLlmProviderMetadata = {
  provider: string;
  model: string;
  version?: string;
  endpoint?: string;
  metadata?: JsonObject;
};

export type AutomationStudioLlmUsageSummary = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
};

export type AutomationStudioLlmProvider = {
  metadata: AutomationStudioLlmProviderMetadata;
  runTask(request: AutomationStudioLlmTaskRequest, execution?: { signal?: AbortSignal }): Promise<unknown>;
};
