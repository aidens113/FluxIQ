// One attempt's place on the model ladder (`./tiers.ts`): how many rungs it has climbed, and why.
//
// **Owned by the attempt's record.** It lives on the attempt's tried record
// (`../../repeat-guard/loop-detection/attempt-record.ts`), which is one per attempt and handed to
// every loop of it, so a climb is sticky for the attempt and a new attempt, with a new record,
// starts on its base rung again. A carried-on attempt is the same attempt: its seed brings the
// climbs back.
//
// **The models come from the provider that serves under it.** The attempt's routed provider
// (`../provider.ts`) says which models it climbs, base first, each time it serves a call inside the
// ladder's frame (`./frame.ts`). Until one has, or where the attempt's model is not on the ladder
// (another provider's), there is nothing to climb and a cause climbs nothing. At the top rung a
// cause climbs nothing either: the caller still steers, and the purse is what ends it.
//
// Content-free: model ids, closed reason codes and a loop pattern, never a page's or a model's words.

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
  /** Rungs climbed above the base in this attempt. */
  readonly level: number;
  /** The models this attempt climbs, base first, once its provider has said. */
  readonly models: readonly string[] | undefined;
  /** The serving provider says which models it climbs, base first. */
  serve(models: readonly string[]): void;
  /** One rung up, and the climb; nothing where there is no ladder or it is at the top. */
  escalate(cause: { reason: AutomationStudioLlmModelLadderReason; pattern?: AutomationStudioLlmLoopPattern | undefined }): AutomationStudioLlmModelEscalation | undefined;
  /** Nothing until a ladder is known: an attempt on a model off the ladder has none. */
  data(): AutomationStudioLlmModelLadderData | undefined;
};

export function automationStudioLlmModelLadder(seed?: AutomationStudioLlmModelLadderData): AutomationStudioLlmModelLadder {
  const escalations: AutomationStudioLlmModelEscalation[] = (seed?.escalations ?? []).map((escalation) => ({ ...escalation }));
  let models: readonly string[] | undefined;
  let level = escalations.length;
  return {
    get level() { return level; },
    get models() { return models; },
    serve(served) {
      if (served.length === 0) return;
      models = [...served];
      level = Math.min(level, models.length - 1);
    },
    escalate({ reason, pattern }) {
      if (!models || level >= models.length - 1) return undefined;
      const escalation: AutomationStudioLlmModelEscalation = { from: models[level]!, to: models[level + 1]!, reason, ...(pattern ? { pattern } : {}) };
      level += 1;
      escalations.push(escalation);
      return { ...escalation };
    },
    data() {
      const base = models?.[0] ?? seed?.base;
      return base === undefined ? undefined : { base, escalations: escalations.map((escalation) => ({ ...escalation })) };
    }
  };
}
