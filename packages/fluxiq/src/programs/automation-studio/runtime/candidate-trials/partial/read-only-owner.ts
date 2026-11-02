import type { AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult } from "../../flow-bootstrap/subflow-candidate/index.ts";

/** A trusted owner of retained evidence and an offline-only diagnosis, with no live fallback. */
export interface PartialTrialReadOnlyOwner {
  pin(request: AutomationStudioSubflowTrialRequest): object | undefined;
  current(lease: object, request: AutomationStudioSubflowTrialRequest): boolean;
  run(lease: object, request: AutomationStudioSubflowTrialRequest): Promise<AutomationStudioSubflowTrialResult>;
}
