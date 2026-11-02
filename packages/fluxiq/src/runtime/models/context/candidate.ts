import type { JsonValue } from "../../../core/index.ts";
import type { ReusableModelContextOutcome } from "./outcome.ts";
import type { ReusableModelContextReviewerState } from "./reviewer-state.ts";
import type { ReusableModelContextValidationState } from "./validation-state.ts";

/** Sanitized advisory context supplied by its owning storage/domain adapter. */
export type ReusableModelContextCandidate = {
  recordId: string;
  contentDigest: string;
  outcome: ReusableModelContextOutcome;
  reviewerState: ReusableModelContextReviewerState;
  validationState: ReusableModelContextValidationState;
  sourceRunIds: string[];
  sourceAdaptationIds: string[];
  promptProjection: JsonValue;
  createdAt: number;
};
