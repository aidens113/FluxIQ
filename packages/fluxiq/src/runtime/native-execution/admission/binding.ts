import type { AutomationStudioNativeNodeImplementation } from "../../../components/automation/importer/index.ts";

/** Created only by the actual native runtime from its private original binding. */
export interface NativeAdmissionBinding {
  readonly runtime: object;
  readonly receiver: object;
  readonly implementation: AutomationStudioNativeNodeImplementation;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly definitionId: string;
  readonly definitionVersion: string;
}
