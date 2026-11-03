import type { ModelProvider } from "../../../models/contracts/index.ts";
import type { AutomationStudioLlmTaskRequest } from "./task-request.ts";
export type { AutomationStudioLlmProviderMetadata, AutomationStudioLlmProviderInputMeasure, AutomationStudioLlmUsageSummary } from "../../../models/contracts/index.ts";

/** Studio binds its authoring task schema to the framework provider port. */
export type AutomationStudioLlmProvider = ModelProvider<AutomationStudioLlmTaskRequest>;
