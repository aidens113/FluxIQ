// The program's answer to an event that waits for one (`./event.ts`).

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";
import { parseWithZod, type FluxNodeParseResult } from "../issue/index.ts";
import { jsonObjectSchema } from "../json/index.ts";
import type { FluxNodeRunEvent } from "./event.ts";

/**
 * - `person_answer`: the person did what was needed (`done`) or will not (`declined`);
 * - `check_answer`: the developer's check passed, or failed with its `reason`, which
 *   goes back into the run as a "no" to fix (plan, N4);
 * - `transform_answer`: the callback's `records`, or the `error` it raised.
 */
export const fluxNodeEventAnswerSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("person_answer"), eventId: fluxNodeFieldSchemas.id, outcome: z.enum(["done", "declined"]), note: fluxNodeFieldSchemas.personText.optional() }).strict(),
    z.object({ type: z.literal("check_answer"), eventId: fluxNodeFieldSchemas.id, pass: z.boolean(), reason: fluxNodeFieldSchemas.personText.optional() }).strict(),
    z
      .object({
        type: z.literal("transform_answer"),
        eventId: fluxNodeFieldSchemas.id,
        records: z.array(jsonObjectSchema).max(1000).optional(),
        error: fluxNodeFieldSchemas.personText.optional()
      })
      .strict()
  ])
  .superRefine((answer, context) => {
    if (answer.type === "check_answer" && !answer.pass && answer.reason === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "A failed check says why, so the run can fix it.", params: { code: "answer.reason_missing" } });
    }
    if (answer.type === "check_answer" && answer.pass && answer.reason !== undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "A passed check gives no reason.", params: { code: "answer.reason_unexpected" } });
    }
    if (answer.type === "transform_answer" && (answer.records === undefined) === (answer.error === undefined)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "A transform answer has exactly one of records and error.", params: { code: "answer.transform_form" } });
    }
  });

export type FluxNodeEventAnswer = z.infer<typeof fluxNodeEventAnswerSchema>;

/** Parses an untrusted value into an answer, or every reason it is not one. */
export function parseFluxNodeEventAnswer(value: unknown): FluxNodeParseResult<FluxNodeEventAnswer> {
  return parseWithZod(fluxNodeEventAnswerSchema, value);
}

const ANSWER_FOR = Object.freeze({ person_needed: "person_answer", check_needed: "check_answer", transform_needed: "transform_answer" } as const);

/** True when `answer` answers `event`: the same event id, and the answer kind its event type asks for. */
export function fluxNodeAnswerFitsEvent(event: FluxNodeRunEvent, answer: FluxNodeEventAnswer): boolean {
  if (event.type !== "person_needed" && event.type !== "check_needed" && event.type !== "transform_needed") return false;
  return event.eventId === answer.eventId && ANSWER_FOR[event.type] === answer.type;
}
