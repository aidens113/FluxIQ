import type { ElementMatcher } from "../../../../runtime/target-matching/index.ts";
import type { AutomationStudioRecordingMapperObservation } from "./observation.ts";
export type AutomationStudioRecordingMapperContext = {
  signal: AbortSignal;
  elementMatcher: ElementMatcher;
  /** The mapper-visible entries after this observation, in timeline order, at most 32: where a mapper reads what an action led to. */
  following: readonly AutomationStudioRecordingMapperObservation[];
};
