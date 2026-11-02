import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import type { AutomationStudioFlowDraftClaimRefusal } from "./claim-refusal.ts";

export type AutomationStudioFlowDraftClaimRefused = (steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep, act: string) => AutomationStudioFlowDraftClaimRefusal | undefined;
