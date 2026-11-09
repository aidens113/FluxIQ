// POST runs/{runId}/answers: the program answers an event that waits for one.

import { z } from "zod";
import { fluxNodeEventAnswerSchema } from "../run/index.ts";

/** The request body: one answer (`fluxNodeEventAnswerSchema`). */
export const fluxNodeAnswerEventRequestSchema = fluxNodeEventAnswerSchema;

/** The response body: the answer was taken. A refused one answers with an error body instead. */
export const fluxNodeAnswerEventResponseSchema = z.object({ accepted: z.literal(true) }).strict();

export type FluxNodeAnswerEventResponse = z.infer<typeof fluxNodeAnswerEventResponseSchema>;
