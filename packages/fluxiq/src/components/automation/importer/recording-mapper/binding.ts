import type { AutomationStudioRecordingMapperDefinition } from "./definition.ts";
import type { AutomationStudioRecordingMapperImplementation } from "./implementation.ts";
import type { AutomationStudioRecordingCandidateParameterNormalizer } from "./parameter-normalizer.ts";

export interface AutomationStudioRecordingMapperBinding {
  definition: AutomationStudioRecordingMapperDefinition;
  packageId: string;
  packageVersion: string;
  implementation: AutomationStudioRecordingMapperImplementation;
  normalizeParameters?: AutomationStudioRecordingCandidateParameterNormalizer;
}
