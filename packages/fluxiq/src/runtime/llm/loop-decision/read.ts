// A `core.loop_decision` call's input, read: the decision and the one thing it must carry, or what
// is missing in the model's terms, so it can be asked again. Words are trimmed and bounded; they
// stay the model's, marked as such wherever they are shown.

import type { JsonObject } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_DECISIONS, type AutomationStudioLlmLoopDecisionKind } from "./tool-id.ts";

/** A decision as read: the words it carries are the model's own. */
export type AutomationStudioLlmLoopDecision =
  | { decision: "continue"; why: string }
  | { decision: "change_approach"; approach: string }
  | { decision: "ask_person"; question: string; why: string }
  | { decision: "escalate_model"; why?: string | undefined }
  | { decision: "finish_with_best"; result: JsonObject };

const MAX_WORDS = 500;

/** What a decision must carry, by field, and the words that ask for it. */
const NEEDS: Readonly<Record<Exclude<AutomationStudioLlmLoopDecisionKind, "escalate_model" | "finish_with_best">, { field: "why" | "approach" | "question"; missing: string }>> = Object.freeze({
  continue: { field: "why", missing: "continue needs why: say why repeating is right here." },
  change_approach: { field: "approach", missing: "change_approach needs approach: name the different way you will take." },
  ask_person: { field: "question", missing: "ask_person needs question: one plain question for the person." }
});

export function automationStudioLlmLoopDecisionRead(input: JsonObject): AutomationStudioLlmLoopDecision | { issue: string } {
  const decision = input.decision;
  if (typeof decision !== "string" || !(AUTOMATION_STUDIO_LLM_LOOP_DECISIONS as readonly string[]).includes(decision)) return { issue: `decision must be one of ${AUTOMATION_STUDIO_LLM_LOOP_DECISIONS.join(", ")}.` };
  const kind = decision as AutomationStudioLlmLoopDecisionKind;
  if (kind === "escalate_model") return { decision: kind, ...(words(input.why) ? { why: words(input.why) } : {}) };
  if (kind === "finish_with_best") {
    const result = input.result;
    return typeof result === "object" && result !== null && !Array.isArray(result) ? { decision: kind, result: result as JsonObject } : { issue: "finish_with_best needs result: the result you have, in the shape a completion takes." };
  }
  const need = NEEDS[kind];
  const said = words(input[need.field]);
  if (!said) return { issue: need.missing };
  if (kind === "ask_person") {
    // Only for a task that is genuinely impossible under the person's instructions: what is impossible, and why, must be said.
    const impossible = words(input.why);
    return impossible ? { decision: kind, question: said, why: impossible } : { issue: "ask_person needs why: name what is impossible under the person's instructions and why, since asking is only for a task that genuinely cannot be completed as instructed, never for difficulty or a repeat." };
  }
  if (kind === "continue") return { decision: kind, why: said };
  if (kind === "change_approach") return { decision: kind, approach: said };
  return { decision: kind, question: said };
}

function words(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_WORDS) : undefined;
}
