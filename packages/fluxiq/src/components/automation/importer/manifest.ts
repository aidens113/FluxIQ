import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../definitions.ts";
import type { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION } from "./version.ts";
import type { AutomationStudioRecordingMapperDefinition } from "./recording-mapper/index.ts";
import type { AutomationStudioTargetResolverDefinition } from "./target-resolver/index.ts";
import type { AutomationStudioComparatorDefinition } from "./comparator/index.ts";
import type { AutomationStudioStateVisualizerDefinition } from "./state-visualizer/index.ts";
import type { AutomationStudioImporterSchema } from "./schema.ts";
export type AutomationStudioImporterSdkManifest = {
  schemaVersion: "0.1";
  sdkVersion: typeof AUTOMATION_STUDIO_IMPORTER_SDK_VERSION;
  packageId: string;
  packageVersion: string;
  domainId: string;
  nodes: AutomationStudioNodeDefinition[];
  recordingMappers?: AutomationStudioRecordingMapperDefinition[];
  targetResolvers?: AutomationStudioTargetResolverDefinition[];
  comparators?: AutomationStudioComparatorDefinition[];
  stateVisualizers?: AutomationStudioStateVisualizerDefinition[];
  schemas?: AutomationStudioImporterSchema[];
  editor?: {
    displayName?: string;
    icon?: string;
    categories?: Array<{
      id: string;
      label: string;
    }>;
  };
  metadata?: JsonObject;
};
