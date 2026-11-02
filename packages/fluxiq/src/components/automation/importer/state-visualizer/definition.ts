import type { JsonObject } from "../../../../core/index.ts";
export type AutomationStudioStateVisualizerDefinition = {
  id: string;
  version: string;
  label: string;
  description?: string;
  supportedNamespaces?: string[];
  supportedKinds?: string[];
  supportedRendererIds?: string[];
  metadata?: JsonObject;
};
