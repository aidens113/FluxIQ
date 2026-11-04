// What a model completes an attempt with: its account and, where the result is words, those
// words. Never rows: rows come from reads alone (plan D9), so there is no field to write one in.

import type { JsonObject } from "../../../../../core/index.ts";

export const AUTOMATION_STUDIO_ANSWER_FIRST_COMPLETION_SCHEMA: JsonObject = Object.freeze({
  type: "object",
  properties: {
    summary: { type: "string", description: "One sentence on what you got." },
    answer: { type: "string", description: "The answer in words, only when the result is words rather than rows or acts." }
  },
  required: ["summary"],
  additionalProperties: false
});
