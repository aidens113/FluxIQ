// What a runtime patch has to settle before `../live-patch.ts` runs it: the
// target override's check -- what a domain is asked about a proposed target,
// the words a refusal is recorded in, and the judgement both the proposed and
// the executed path share -- the insert a repair makes when the failure is a
// step the Flow never had, and the one overlay every patch kind is applied
// through, with the unit digest guard that holds a repair to the unit it names
// (state-aware recovery plan, C6 step 8 and C12).

export * from "./failed-action.ts";
export * from "./refusal-reasons.ts";
export * from "./step-insert.ts";
export * from "./target-override-check.ts";
export * from "./overlay.ts";
export { automationStudioGraphUnitDigests, automationStudioGraphUnits, automationStudioRepairUnitDigest, automationStudioUnitDigestRefusal, type AutomationStudioGraphUnitKey, type AutomationStudioGraphUnits, type AutomationStudioUnitGraph } from "./unit-digest.ts";
export type { AutomationStudioOverlayValidationContext } from "./overlay-validation.ts";
