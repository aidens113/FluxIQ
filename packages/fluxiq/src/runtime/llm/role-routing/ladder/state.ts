// Inert compatibility state for old persisted attempts; the frame also carries continuation identity.
import type { AutomationStudioLlmLoopPattern } from "../../repeat-guard/index.ts";

/** Why an attempt climbed: each a fact Core already holds that says it cannot get there on this model. */
export type AutomationStudioLlmModelLadderReason =
  /** Told it was repeating itself, the model decided to hand the attempt to a stronger model (`escalate_model`). */
  | "model_decided"
  /** The loop detector caught a repeat (the same act, call or fix again) where no model is asked to decide. */
  | "loop_detected"
  /** Decisions went on bringing nothing new: the detector's window of no progress. */
  | "no_new_evidence"
  /** The detector's steer and refusals did not stop it, and the round was stopped. */
  | "loop_persisted"
  /** The same completion was refused again over unchanged evidence. */
  | "completion_refused_again"
  /** A round repairing the saved Flow ended without the result. */
  | "repair_failed";

/** One climb: from which model to which, and why. */
export type AutomationStudioLlmModelEscalation = {
  from: string;
  to: string;
  reason: AutomationStudioLlmModelLadderReason;
  pattern?: AutomationStudioLlmLoopPattern;
};

/** The ladder as data, for the attempt's row and a carried-on attempt. */
export type AutomationStudioLlmModelLadderData = {
  /** The model the attempt started on. */
  base: string;
  escalations: readonly AutomationStudioLlmModelEscalation[];
};

export type AutomationStudioLlmModelLadder = {
  /** Always zero: historical escalations cannot change serving. */
  readonly level: number;
  /** The models this attempt climbs, base first, once its provider has said. */
  readonly models: readonly string[] | undefined;
  /** The serving provider says which models it climbs, base first. */
  serve(models: readonly string[]): void;
  /** Compatibility operation: always returns nothing and never changes the model. */
  escalate(cause: { reason: AutomationStudioLlmModelLadderReason; pattern?: AutomationStudioLlmLoopPattern | undefined }): AutomationStudioLlmModelEscalation | undefined;
  /** Nothing until a ladder is known: an attempt on a model off the ladder has none. */
  data(): AutomationStudioLlmModelLadderData | undefined;
};

/** Historical ladder records stay readable; model escalation is disabled for every caller. */
export function automationStudioLlmModelLadder(seed?: AutomationStudioLlmModelLadderData): AutomationStudioLlmModelLadder {
  const historical = seed ? { base: seed.base, escalations: seed.escalations.map((each) => ({ ...each })) } : undefined;
  let models: readonly string[] | undefined;
  return {
    level: 0,
    get models() { return models; },
    serve(served) {
      if (served.length > 0) models = [served[0]!];
    },
    escalate: () => undefined,
    data() {
      if (historical) return { base: historical.base, escalations: historical.escalations.map((each) => ({ ...each })) };
      return models ? { base: models[0]!, escalations: [] } : undefined;
    }
  };
}
