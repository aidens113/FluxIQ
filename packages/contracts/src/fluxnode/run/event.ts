// What a run tells the program while it runs, over the event stream (plan, N4, N6,
// D2). Three events wait for the program's answer (`./answer.ts`): a person-only
// moment, the developer's check, and a transform written as a function in the SDK.

import { z } from "zod";
import { sdkCallbackNameSchema } from "../data/index.ts";
import { fluxNodeFieldSchemas } from "../fields/index.ts";
import { parseWithZod, type FluxNodeParseResult } from "../issue/index.ts";
import { jsonObjectSchema, jsonValueSchema } from "../json/index.ts";
import { fluxNodeCostSchema } from "./cost.ts";
import { fluxNodeRunResultSchema } from "./result.ts";

/** Every kind of run event. */
export const FLUXNODE_RUN_EVENT_TYPES = Object.freeze(["step", "person_needed", "check_needed", "transform_needed", "cost", "ended"] as const);

export type FluxNodeRunEventType = (typeof FLUXNODE_RUN_EVENT_TYPES)[number];

/** What a step is doing. A step that `failed` is retried or worked around; the run itself never ends as failed. */
export const FLUXNODE_STEP_STATES = Object.freeze(["started", "succeeded", "retrying", "failed", "skipped"] as const);

/** Why a person is needed: to sign in, to pass a check meant for people, to confirm something, or another reason in words. */
export const FLUXNODE_PERSON_NEEDS = Object.freeze(["sign_in", "human_check", "confirm", "other"] as const);

const common = { runId: fluxNodeFieldSchemas.id, seq: z.number().int().min(1), at: fluxNodeFieldSchemas.epochMs };

/**
 * Every event names its run, a sequence number that rises by one from 1, and when it
 * happened. The ones that wait for an answer carry an `eventId` to answer.
 *
 * - `step`: a step changed state; `label` says what it does in a person's words;
 * - `person_needed`: only a person can go on (`need`, `reason`); unanswered by
 *   `waitUntil`, the run ends `waiting_for_person`;
 * - `check_needed`: run the developer's check on `outputs` and `inputs`;
 * - `transform_needed`: run the program's `callback` over `records` for step `stepId`;
 * - `cost`: what the run has spent so far, and its budget;
 * - `ended`: the run's result. The last event of every run.
 */
export const fluxNodeRunEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...common,
      type: z.literal("step"),
      flowId: fluxNodeFieldSchemas.id,
      stepId: fluxNodeFieldSchemas.id,
      label: fluxNodeFieldSchemas.shortText,
      state: z.enum(FLUXNODE_STEP_STATES),
      attempt: z.number().int().min(1).optional()
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("person_needed"),
      eventId: fluxNodeFieldSchemas.id,
      need: z.enum(FLUXNODE_PERSON_NEEDS),
      reason: fluxNodeFieldSchemas.personText,
      waitUntil: fluxNodeFieldSchemas.epochMs.optional()
    })
    .strict(),
  z.object({ ...common, type: z.literal("check_needed"), eventId: fluxNodeFieldSchemas.id, outputs: jsonValueSchema, inputs: jsonObjectSchema }).strict(),
  z
    .object({
      ...common,
      type: z.literal("transform_needed"),
      eventId: fluxNodeFieldSchemas.id,
      stepId: fluxNodeFieldSchemas.id,
      callback: sdkCallbackNameSchema,
      records: z.array(jsonObjectSchema).max(1000)
    })
    .strict(),
  z.object({ ...common, type: z.literal("cost"), cost: fluxNodeCostSchema, budgetUsd: fluxNodeFieldSchemas.usd }).strict(),
  z.object({ ...common, type: z.literal("ended"), result: fluxNodeRunResultSchema }).strict()
]);

export type FluxNodeRunEvent = z.infer<typeof fluxNodeRunEventSchema>;

/** Parses an untrusted value into a run event, or every reason it is not one. */
export function parseFluxNodeRunEvent(value: unknown): FluxNodeParseResult<FluxNodeRunEvent> {
  return parseWithZod(fluxNodeRunEventSchema, value);
}
