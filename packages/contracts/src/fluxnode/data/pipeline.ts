// A data pipeline (plan, D3): a Flow whose steps call Flows and move data. This is
// its declaration as the SDK's `pipeline()` builder sends it; compiling it into a Flow
// is the engine's work. Its name maps to its Flow path the way a FluxNode's does.

import { z } from "zod";
import { flowCallTargetSchema, flowInputsSchema, fluxNodeNameSchema } from "../flow/index.ts";
import { parseWithZod, type FluxNodeParseResult } from "../issue/index.ts";
import { jsonTypeSchemaSchema } from "../type-schema/index.ts";
import { datasetRefSchema } from "./dataset-ref.ts";
import { dataExpressionSchema } from "./expression.ts";
import { dataFieldPathSchema } from "./field-path.ts";
import { dataStepSchema } from "./step.ts";

/** At most 200 steps. */
export const DATA_PIPELINE_MAX_STEPS = 200;

/**
 * Where the first step's records come from: a stored dataset, a list in the
 * pipeline's inputs at `field`, or the outputs of a Flow called once with `inputs`
 * built from the pipeline's inputs (`{ input }` expressions).
 */
export const dataPipelineSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dataset"), dataset: datasetRefSchema }).strict(),
  z.object({ kind: z.literal("input"), field: dataFieldPathSchema }).strict(),
  z.object({ kind: z.literal("flow"), target: flowCallTargetSchema, inputs: z.record(dataExpressionSchema).optional() }).strict()
]);

/**
 * A pipeline: `name`, optional typed `inputs`, a `source`, 1 to 200 `steps`, and an
 * optional output type the final records are checked against. Step ids are unique,
 * and a step's `input` or a join's `with.step` names an earlier step, so the steps
 * form no cycle.
 */
export const dataPipelineSchema = z
  .object({
    name: fluxNodeNameSchema,
    inputs: flowInputsSchema.optional(),
    source: dataPipelineSourceSchema,
    steps: z.array(dataStepSchema).min(1).max(DATA_PIPELINE_MAX_STEPS),
    outputs: jsonTypeSchemaSchema.optional()
  })
  .strict()
  .superRefine((pipeline, context) => {
    const earlier = new Set<string>();
    pipeline.steps.forEach((step, index) => {
      const refers = (id: string | undefined, at: Array<string | number>): void => {
        if (id !== undefined && !earlier.has(id)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["steps", index, ...at], message: `"${id}" is not an earlier step.`, params: { code: "pipeline.unknown_step" } });
        }
      };
      refers(step.input, ["input"]);
      if (step.kind === "join" && "step" in step.with) refers(step.with.step, ["with", "step"]);
      if (earlier.has(step.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["steps", index, "id"], message: `Step id "${step.id}" is used twice.`, params: { code: "pipeline.duplicate_step" } });
      earlier.add(step.id);
    });
  });

export type DataPipeline = z.infer<typeof dataPipelineSchema>;

/** What a developer writes, before step defaults are filled. */
export type DataPipelineInput = z.input<typeof dataPipelineSchema>;

/** Parses an untrusted value into a pipeline, or every reason it is not one. */
export function parseDataPipeline(value: unknown): FluxNodeParseResult<DataPipeline> {
  return parseWithZod(dataPipelineSchema, value);
}
