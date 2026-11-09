// The steps of a pipeline, added one after another (plan, D2, D3). Each method adds one
// of the contracts' data steps; `build` validates the whole with the contracts' parser.
// A step reads the step before it unless `input` names an earlier one.

import { parseDataPipeline, type DataExpression, type DataFieldPath, type DataSink } from "@fluxiq/contracts/fluxnode";
import type { TransformFunction } from "../client/index.ts";
import { SdkError } from "../errors/index.ts";
import { typeSchemaFrom, type TypeSchemaInput } from "../schema/index.ts";
import type { BuiltPipeline } from "./built-pipeline.ts";
import { flowTarget, type FlowTargetInput } from "./flow-target.ts";

type Step = Record<string, unknown>;

/** Options every step takes: its `id` (default `<kind>-<n>`) and the earlier step it reads. */
export type StepOptions = { id?: string; input?: string };

export type PipelineState = { name: string; inputs: unknown; source: Record<string, unknown> };

/** A pipeline with its source chosen, ready for steps. */
export class PipelineBuilder {
  readonly #state: PipelineState;
  readonly #steps: Step[] = [];
  readonly #callbacks: Record<string, TransformFunction> = {};
  #outputs: unknown;

  constructor(state: PipelineState) {
    this.#state = state;
  }

  #add(kind: string, options: StepOptions, fields: Step): this {
    const step: Step = { id: options.id ?? `${kind}-${this.#steps.length + 1}`, kind };
    if (options.input !== undefined) step.input = options.input;
    this.#steps.push({ ...step, ...fields });
    return this;
  }

  #register(prefix: string, fn: TransformFunction): string {
    const name = `${prefix}${Object.keys(this.#callbacks).length + 1}`;
    this.#callbacks[name] = fn;
    return name;
  }

  /** Calls a FluxNode (or Flow) once per record, with `inputs` built from the record. The result lands under `as` (default "result"). */
  map(target: FlowTargetInput, step: StepOptions & { inputs: Record<string, DataExpression>; as?: string; concurrency?: number; skipProcessedBy?: DataFieldPath[]; reuseResultsForMs?: number }): this {
    const fields: Step = { target: flowTarget(target), inputs: step.inputs };
    for (const key of ["as", "concurrency", "skipProcessedBy", "reuseResultsForMs"] as const) if (step[key] !== undefined) fields[key] = step[key];
    return this.#add("map", step, fields);
  }

  /** Keeps the records for which `where` is true. */
  filter(where: DataExpression, options: StepOptions = {}): this {
    return this.#add("filter", options, { where });
  }

  /** Replaces each record with a declared `expression`, or with what `fn` returns, `batchSize` records at a time. */
  transform(how: { expression: DataExpression } | { fn: TransformFunction; batchSize?: number }, options: StepOptions = {}): this {
    if ("expression" in how) return this.#add("transform", options, { expression: how.expression });
    const fields: Step = { callback: this.#register("transform", how.fn) };
    if (how.batchSize !== undefined) fields.batchSize = how.batchSize;
    return this.#add("transform", options, fields);
  }

  /** Keeps the `first` (default) or `last` record of each `key`. */
  dedupe(key: DataFieldPath[], options: StepOptions & { keep?: "first" | "last" } = {}): this {
    return this.#add("dedupe", options, options.keep === undefined ? { key } : { key, keep: options.keep });
  }

  /** Matches records with an earlier step's (`{ step }`) or a dataset's (`{ dataset }`) on `on`. */
  join(with_: { step: string } | { dataset: { datasetId: string } }, on: Array<{ left: DataFieldPath; right: DataFieldPath }>, options: StepOptions & { how?: "inner" | "left"; as?: string } = {}): this {
    const fields: Step = { with: with_, on };
    if (options.how !== undefined) fields.how = options.how;
    if (options.as !== undefined) fields.as = options.as;
    return this.#add("join", options, fields);
  }

  /** Orders the records by `by`. */
  sort(by: Array<{ field: DataFieldPath; order?: "asc" | "desc" }>, options: StepOptions = {}): this {
    return this.#add("sort", options, { by });
  }

  /** Keeps `count` records after `offset`. */
  limit(count: number, options: StepOptions & { offset?: number } = {}): this {
    return this.#add("limit", options, options.offset === undefined ? { count } : { count, offset: options.offset });
  }

  /** One record per `groupBy` group, with each measure under its name. */
  aggregate(measures: Array<{ name: string; op: "count" | "count_distinct" | "sum" | "min" | "max" | "avg" | "first" | "last" | "collect"; field?: DataFieldPath }>, options: StepOptions & { groupBy?: DataFieldPath[] } = {}): this {
    return this.#add("aggregate", options, { groupBy: options.groupBy ?? [], measures });
  }

  /** Checks each record against `type`: an invalid one is dropped, or (default) rejected, which the run treats as a "no" to fix. */
  validate(type: TypeSchemaInput, options: StepOptions & { onInvalid?: "drop" | "reject" } = {}): this {
    const fields: Step = { type: typeSchemaFrom(type, "validate step") };
    if (options.onInvalid !== undefined) fields.onInvalid = options.onInvalid;
    return this.#add("validate", options, fields);
  }

  /** Sends the records to a declared sink, or to `fn` in this program, and passes them on. */
  sink(to: DataSink | ((records: Array<Record<string, unknown>>) => void | Promise<void>), options: StepOptions = {}): this {
    if (typeof to !== "function") return this.#add("sink", options, { to });
    const callback = this.#register("sink", async (records) => {
      await to(records);
      return records;
    });
    return this.#add("sink", options, { to: { kind: "sdk", callback } });
  }

  /** The type the final records are checked against. */
  outputs(type: TypeSchemaInput): this {
    this.#outputs = typeSchemaFrom(type, "outputs");
    return this;
  }

  /** Validates the pipeline with the contracts' parser and returns it. */
  build(): BuiltPipeline {
    const draft: Record<string, unknown> = { name: this.#state.name, source: this.#state.source, steps: this.#steps };
    if (this.#state.inputs !== undefined) draft.inputs = this.#state.inputs;
    if (this.#outputs !== undefined) draft.outputs = this.#outputs;
    const parsed = parseDataPipeline(draft);
    if (!parsed.ok) {
      const lines = parsed.issues.map((issue) => `${issue.path === "" ? "(pipeline)" : issue.path}: ${issue.message}`);
      throw new SdkError("invalid_definition", `Pipeline "${this.#state.name}" is not valid:\n  ${lines.join("\n  ")}`, { issues: parsed.issues });
    }
    return { definition: parsed.value, callbacks: { ...this.#callbacks } };
  }
}
