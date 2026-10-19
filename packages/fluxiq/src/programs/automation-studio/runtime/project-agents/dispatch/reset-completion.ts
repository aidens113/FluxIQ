import type { JsonObject } from "../../../../../core/index.ts";

/**
 * A reset brief's completion (`./reset-loop.ts`): a summary, and the acts the
 * site offers no control to reverse.
 *
 * **One schema, read by both sides (F3, office r1 `run-mved5pro-91998cc2`).**
 * The reset loop builds its decision schema from this, and the build's reset
 * ports send it as the request's completion schema
 * (`service/project-build/brief-ports.ts`). Each side held its own copy, and
 * when one copy's `cannotUndo` description was reworded alone, the provider's
 * pre-send check -- which rebuilds the decision schema from the completion
 * schema a request carries (`llm/deepseek/preflight.ts`) -- refused every
 * reset's first decision `llm.provider_evidence_loop_context_invalid`, before
 * any call. There is now only this one.
 */
export const AUTOMATION_STUDIO_PROJECT_RESET_COMPLETION: JsonObject = Object.freeze({
  type: "object",
  properties: {
    summary: { type: "string" },
    cannotUndo: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", pattern: "^act-[1-9][0-9]{0,3}$" },
      description: "Only the listed acts the site offers no control to reverse, after you looked for one on the item each acted on: report these as unresolved. Reversible effects still require proved restoration before an ordinary trial. Never an act you could undo."
    }
  },
  additionalProperties: false
});
