// The decision variant that lists several actions, and the only place the
// model is told it may.
//
// The telling lives in the variant's own `description` because that is where
// the model looks when it chooses a shape: the output schema is sent with every
// evidence decision, creation's and a repair exploration's alike, so the
// sentence reaches both paths without being added to either one's prose, and
// it cannot drift from the shape it describes. A model not told it may batch
// does not: before this, every live decision named one action.
//
// The items name the tool by an `enum` of the tools offered this turn and take
// `input` as any object. Each tool's input shape is already in the schema once,
// in its own single-call variant; repeating it per item would roughly double
// the schema a request carries, on every call, for nothing the model needs.
// Each tool still checks its own input when it runs.

import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_ACTIONS_PER_DECISION } from "../../loop-limits/index.ts";

/** What the model reads about batching. Core's words; bounded and constant. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_BATCH_DESCRIPTION = "Several actions in one decision, when you already know each one you need next, such as filling a form's fields: give each action's toolId and the input its own tool_call variant takes. They run in order. The batch stops at the first action that is refused or does not take effect, and after any action that may change what earlier target handles refer to, such as moving to another page. One core.batch_result evidence entry then reports every action's outcome in order and, under latest, the evidence as it stands after the last action that ran. Ask again for any action it did not run.";

/** The listed-actions variant for the tools offered this turn. */
export function automationStudioLlmEvidenceBatchDecisionSchema(toolIds: readonly string[]): JsonObject {
  return {
    type: "object", additionalProperties: false, required: ["kind", "calls"],
    description: AUTOMATION_STUDIO_LLM_EVIDENCE_BATCH_DESCRIPTION,
    properties: {
      kind: { const: "tool_calls" },
      calls: {
        type: "array", minItems: 2, maxItems: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_ACTIONS_PER_DECISION,
        items: {
          type: "object", additionalProperties: false, required: ["toolId", "input"],
          properties: { toolId: { enum: [...toolIds] }, input: { type: "object" } }
        }
      }
    }
  };
}

