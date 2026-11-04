// What a model completes an attempt with: its account and, where the result is words, those
// words. Never rows: rows come from reads alone (plan D9), so there is no field to write one in.

import type { JsonObject } from "../../../../../core/index.ts";

export const AUTOMATION_STUDIO_ANSWER_FIRST_COMPLETION_SCHEMA: JsonObject = Object.freeze({
  type: "object",
  properties: {
    summary: { type: "string", description: "One sentence on what you got." },
    answer: { type: "string", description: "The answer in words, only when the result is words rather than rows or acts." },
    notes: {
      type: "object",
      description: "Short plain notes for the next attempt at this same task. Hold no secrets: no passwords, keys or codes.",
      properties: {
        worked: { type: "string", description: "What worked on this site." },
        failed: { type: "string", description: "What did not work." },
        quirks: { type: "string", description: "Anything odd about the site worth knowing next time." }
      },
      additionalProperties: false
    }
  },
  required: ["summary"],
  additionalProperties: false
});
