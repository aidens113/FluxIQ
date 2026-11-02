import type { ElementMatcher } from "../../../runtime/target-matching/index.ts";
import type { AutomationStudioNodeParameterContract } from "../definitions.ts";
import type { AutomationStudioNativeNodeImplementation } from "./native-node/index.ts";
import type { AutomationStudioRecordingMapperImplementation } from "./recording-mapper/index.ts";
import type { AutomationStudioTargetResolverImplementation } from "./target-resolver/index.ts";
import type { AutomationStudioComparatorImplementation } from "./comparator/index.ts";
export type AutomationStudioImporterImplementationBundle = {
  packageId: string;
  packageVersion: string;
  implementations: Record<string, AutomationStudioNativeNodeImplementation>;
  /** Explicit matcher for this manifest domain. Missing adapters cannot score targets. */
  elementMatcher?: ElementMatcher;
  recordingMappers?: Record<string, AutomationStudioRecordingMapperImplementation>;
  targetResolvers?: Record<string, AutomationStudioTargetResolverImplementation>;
  comparators?: Record<string, AutomationStudioComparatorImplementation>;
  /**
   * Checks of a node's parameter values, keyed by the id of a node the manifest
   * declares. Registration binds each onto the node registry, where validation
   * of a generated plan calls it (`AutomationStudioNodeParameterContract`).
   */
  parameterContracts?: Record<string, AutomationStudioNodeParameterContract>;
};
