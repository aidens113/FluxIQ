import type { ActionTarget as CanonicalActionTarget, ActionResult as CanonicalActionResult, PolicyAction as CanonicalPolicyAction } from "@fluxiq/contracts/runtime";
import type { AutomationStudioElementTarget } from "./action-element-target.ts";
import type { EvidenceReference } from "./evidence.ts";
export type { ParameterDefinition, PreflightDefinition, ActionSafetyMetadata, ActionDefinition, ActionVisualTargetSource, ActionVisualEntityTarget } from "@fluxiq/contracts/runtime";
// Existing legacy target specialization: domain keys stay at this compatibility leaf.
export type ActionTarget = CanonicalActionTarget<AutomationStudioElementTarget> & { selector?: string };
export type ActionResult = CanonicalActionResult<EvidenceReference>;
export type PolicyAction = CanonicalPolicyAction<ActionTarget, EvidenceReference>;
