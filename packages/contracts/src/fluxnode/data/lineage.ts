// Where a value came from (plan, D1, N3): every value a run returns traces to
// something it read or to an input. A model may choose and arrange values but never
// writes one, so there is no "the model said so" source.

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";

const POINTER = /^(?:\/(?:[^~/]|~[01])*)*$/u;

/** A JSON Pointer, at most 1024 characters: `""` is the whole value, `/listings/0/price` one field. */
export const jsonPointerSchema = z.string().max(1024).regex(POINTER, 'A JSON Pointer such as "/listings/0/price", or "" for the whole value.');

/**
 * - `read`: a step read it from the site or app; `readId` names that read in the
 *   run's record;
 * - `input`: it is the run's input at `pointer`;
 * - `derived`: a data step computed it from the values at `from` (pointers into the
 *   step's own input), with no model.
 */
export const dataLineageSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("read"), readId: fluxNodeFieldSchemas.id }).strict(),
  z.object({ kind: z.literal("input"), pointer: jsonPointerSchema }).strict(),
  z.object({ kind: z.literal("derived"), from: z.array(jsonPointerSchema).min(1).max(64) }).strict()
]);

/**
 * The lineage of one value: `pointer` is where the value sits in what it describes
 * (a run's outputs, a record), and the rest is where it came from: which run, which
 * Flow and step, and which read or input. A read or a derived value names its step.
 */
export const dataLineageSchema = z
  .object({
    pointer: jsonPointerSchema,
    runId: fluxNodeFieldSchemas.id,
    flowId: fluxNodeFieldSchemas.id.optional(),
    stepId: fluxNodeFieldSchemas.id.optional(),
    source: dataLineageSourceSchema
  })
  .strict()
  .superRefine((lineage, context) => {
    if (lineage.source.kind !== "input" && lineage.stepId === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["stepId"], message: `A ${lineage.source.kind} value names the step it came from.`, params: { code: "lineage.step_missing" } });
    }
  });

export type DataLineage = z.infer<typeof dataLineageSchema>;
