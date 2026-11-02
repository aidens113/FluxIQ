import type { StateSnapshot, StateVisualFrame } from "../state.ts";
import { validateStateSnapshot as validateSnapshot, validateStateVisualFrame as validateFrame } from "../../../../runtime/state/index.ts";
import type { AutomationStudioValidationIssue, AutomationStudioValidationResult } from "./issue.ts";
export { validateEvidenceAnchor, validateStatePath } from "../../../../runtime/state/index.ts";
const contentReferences = {
  accepts(value: string): boolean {
    const trimmed = value.trim();
    return trimmed.startsWith("automation-object://") || trimmed.startsWith("fluxiq-object://") || trimmed.startsWith("object://") || trimmed.startsWith("/api/");
  },
  rejectedMessage: "Image layer contentRef must be an Automation Studio object or API reference."
};
export function validateStateSnapshot(snapshot: StateSnapshot): AutomationStudioValidationResult { return validateSnapshot(snapshot, contentReferences); }
export function validateStateVisualFrame(frame: StateVisualFrame): AutomationStudioValidationResult;
export function validateStateVisualFrame(frame: StateVisualFrame, issues: AutomationStudioValidationIssue[], path: string): void;
export function validateStateVisualFrame(frame: StateVisualFrame, issues?: AutomationStudioValidationIssue[], path = "visualFrame"): AutomationStudioValidationResult | void {
  if (issues) validateFrame(frame, contentReferences, issues, path);
  else return validateFrame(frame, contentReferences);
}
