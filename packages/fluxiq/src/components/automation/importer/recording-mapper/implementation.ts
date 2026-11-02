import type { AutomationStudioRecordingMapperObservation } from "./observation.ts";
import type { AutomationStudioRecordingMapperContext } from "./context.ts";
import type { AutomationStudioRecordingMapperResult } from "./result.ts";
export type AutomationStudioRecordingMapperImplementation = (observation: AutomationStudioRecordingMapperObservation, context: AutomationStudioRecordingMapperContext) => AutomationStudioRecordingMapperResult | Promise<AutomationStudioRecordingMapperResult>;
