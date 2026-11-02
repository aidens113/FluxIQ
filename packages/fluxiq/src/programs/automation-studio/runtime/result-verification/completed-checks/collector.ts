import type { AutomationStudioFlowIntervention } from "../../../model/index.ts";
import { CompletedVerificationChecks } from "../../../../../runtime/result-verification/control/index.ts";

/** Studio keeps its original full intervention receipt; collection is framework-owned. */
export type AutomationStudioCompletedVerificationChecks = CompletedVerificationChecks<AutomationStudioFlowIntervention>;
export const AutomationStudioCompletedVerificationChecks = CompletedVerificationChecks<AutomationStudioFlowIntervention>;
