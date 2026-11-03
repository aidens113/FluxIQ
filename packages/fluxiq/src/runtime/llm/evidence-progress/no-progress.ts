import { automationStudioLlmEvidenceNoProgress as trackProgress, type AutomationStudioLlmEvidenceNoProgress } from "../../agents/progress/index.ts";
import type { JsonObject } from "../../../core/index.ts";
import { automationStudioLlmEvidenceStallRedirect, type AutomationStudioLlmEvidenceStallRedirectInput } from "./stall-redirect.ts";
export type { AutomationStudioLlmEvidenceNoProgress } from "../../agents/progress/index.ts";

/** Studio supplies the existing Flow-specific redirect wording around the generic state guard. */
export function automationStudioLlmEvidenceNoProgress(input: {
  max: number;
  redirectAt: number;
  /** What the redirection needs that this module does not hold: the draft, the attempts to finish, and what refused the last one. */
  facts(): Omit<AutomationStudioLlmEvidenceStallRedirectInput, "stepsWithoutProgress" | "maxStepsWithoutProgress" | "repeatingToolIds" | "lastIssueCodes">;
  /** Put the redirection in front of the model, or drop it when it will not fit. */
  show(iteration: number, note: JsonObject): void;
}): AutomationStudioLlmEvidenceNoProgress {
  return trackProgress({
    max: input.max,
    redirectAt: input.redirectAt,
    onRedirect: (iteration, snapshot) => input.show(iteration, automationStudioLlmEvidenceStallRedirect({ ...snapshot, ...input.facts() }))
  });
}
