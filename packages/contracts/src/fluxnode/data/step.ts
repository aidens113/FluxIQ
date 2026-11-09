// The steps of a data pipeline (plan, D2, D4). Each is deterministic and makes no
// model call: a map calls a Flow once per record, and the rest move, shape and check
// records. Each step reads the records of the step before it, or of the step its
// `input` names.

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";
import { flowCallTargetSchema } from "../flow/index.ts";
import { jsonTypeSchemaSchema } from "../type-schema/index.ts";
import { datasetRefSchema } from "./dataset-ref.ts";
import { dataExpressionSchema } from "./expression.ts";
import { dataFieldPathSchema } from "./field-path.ts";
import { dataSinkSchema, sdkCallbackNameSchema } from "./sink.ts";

/** Every kind of data step. */
export const DATA_STEP_KINDS = Object.freeze(["map", "filter", "transform", "dedupe", "join", "sort", "limit", "aggregate", "validate", "sink"] as const);

export type DataStepKind = (typeof DATA_STEP_KINDS)[number];

/** How an aggregate measure folds a group's values. `count` needs no field; every other one does. */
export const DATA_AGGREGATE_OPERATIONS = Object.freeze(["count", "count_distinct", "sum", "min", "max", "avg", "first", "last", "collect"] as const);

/** A step id: a lowercase letter, then lowercase letters, digits, "_" and "-", at most 64. */
export const dataStepIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/u, 'A step id such as "enrich" or "top-10": a lowercase letter, then lowercase letters, digits, "_" and "-".');

const fieldName = z.string().min(1).max(128);
const MONTH_MS = 31 * 24 * 60 * 60 * 1000;
const base = { id: dataStepIdSchema, input: dataStepIdSchema.optional() };

const mapStep = z
  .object({
    ...base,
    kind: z.literal("map"),
    target: flowCallTargetSchema,
    inputs: z.record(dataExpressionSchema),
    as: fieldName.default("result"),
    concurrency: z.number().int().min(1).max(64).default(1),
    skipProcessedBy: z.array(dataFieldPathSchema).min(1).max(8).optional(),
    reuseResultsForMs: z.number().int().positive().max(MONTH_MS).optional()
  })
  .strict();

const filterStep = z.object({ ...base, kind: z.literal("filter"), where: dataExpressionSchema }).strict();

const transformStep = z
  .object({
    ...base,
    kind: z.literal("transform"),
    expression: dataExpressionSchema.optional(),
    callback: sdkCallbackNameSchema.optional(),
    batchSize: z.number().int().min(1).max(1000).optional()
  })
  .strict();

const dedupeStep = z.object({ ...base, kind: z.literal("dedupe"), key: z.array(dataFieldPathSchema).min(1).max(8), keep: z.enum(["first", "last"]).default("first") }).strict();

const joinStep = z
  .object({
    ...base,
    kind: z.literal("join"),
    with: z.union([z.object({ step: dataStepIdSchema }).strict(), z.object({ dataset: datasetRefSchema }).strict()]),
    on: z.array(z.object({ left: dataFieldPathSchema, right: dataFieldPathSchema }).strict()).min(1).max(8),
    how: z.enum(["inner", "left"]).default("inner"),
    as: fieldName.optional()
  })
  .strict();

const sortStep = z
  .object({ ...base, kind: z.literal("sort"), by: z.array(z.object({ field: dataFieldPathSchema, order: z.enum(["asc", "desc"]).default("asc") }).strict()).min(1).max(8) })
  .strict();

const limitStep = z.object({ ...base, kind: z.literal("limit"), count: fluxNodeFieldSchemas.count, offset: fluxNodeFieldSchemas.count.optional() }).strict();

const aggregateStep = z
  .object({
    ...base,
    kind: z.literal("aggregate"),
    groupBy: z.array(dataFieldPathSchema).max(8).default([]),
    measures: z.array(z.object({ name: fieldName, op: z.enum(DATA_AGGREGATE_OPERATIONS), field: dataFieldPathSchema.optional() }).strict()).min(1).max(32)
  })
  .strict();

const validateStep = z.object({ ...base, kind: z.literal("validate"), type: jsonTypeSchemaSchema, onInvalid: z.enum(["drop", "reject"]).default("reject") }).strict();

const sinkStep = z.object({ ...base, kind: z.literal("sink"), to: dataSinkSchema }).strict();

/**
 * One data step:
 *
 * - `map`: calls `target` once per record with `inputs` built from the record, up to
 *   `concurrency` at once, and puts the Flow's outputs under the field `as`. A record
 *   whose `skipProcessedBy` key was already processed is skipped, and a Flow's result
 *   for identical inputs is reused within `reuseResultsForMs`;
 * - `filter`: keeps the records for which `where` is true;
 * - `transform`: replaces each record with `expression`'s value, or with what the
 *   program's `callback` answers, `batchSize` records at a time; exactly one of the two;
 * - `dedupe`: keeps the `first` or `last` record of each `key`;
 * - `join`: matches records with a step's or a dataset's on `on`, `inner` or `left`,
 *   merging the match's fields (the left's win) or putting it under `as`;
 * - `sort`, `limit`: order by `by`; keep `count` records after `offset`;
 * - `aggregate`: one record per `groupBy` group, with each measure under its `name`;
 * - `validate`: checks each record against `type`; an invalid one is dropped, or
 *   (`reject`) rejected with its errors, which the run treats as a "no" to fix;
 * - `sink`: sends the records to `to` and passes them on.
 */
export const dataStepSchema = z
  .discriminatedUnion("kind", [mapStep, filterStep, transformStep, dedupeStep, joinStep, sortStep, limitStep, aggregateStep, validateStep, sinkStep])
  .superRefine((step, context) => {
    if (step.kind === "transform" && (step.expression === undefined) === (step.callback === undefined)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "A transform has exactly one of expression and callback.", params: { code: "data_step.transform_form" } });
    }
    if (step.kind === "transform" && step.batchSize !== undefined && step.callback === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["batchSize"], message: "batchSize applies only to a callback transform.", params: { code: "data_step.batch_without_callback" } });
    }
    if (step.kind === "aggregate") {
      step.measures.forEach((measure, index) => {
        if ((measure.op === "count") !== (measure.field === undefined)) {
          const message = measure.op === "count" ? "A count measure counts records and takes no field." : `A ${measure.op} measure names the field it folds.`;
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["measures", index, "field"], message, params: { code: "data_step.measure_field" } });
        }
      });
    }
  });

export type DataStep = z.infer<typeof dataStepSchema>;

/** What a developer writes, before defaults (`as`, `concurrency`, `keep`, `how`, `order`, `groupBy`, `onInvalid`) are filled. */
export type DataStepInput = z.input<typeof dataStepSchema>;
