// `pipeline()`: the builder for a data pipeline (plan, D3). A pipeline is a Flow whose
// steps call Flows and move data; this builds the contracts' definition of one.

import { typeSchemaFrom, type TypeSchemaInput } from "../schema/index.ts";
import { PipelineStart } from "./source-chooser.ts";

/** Begins a pipeline named `name` (a FluxNode name). `inputs` types its inputs, as for a FluxNode. */
export function pipeline(name: string, options: { inputs?: TypeSchemaInput } = {}): PipelineStart {
  return new PipelineStart(name, options.inputs === undefined ? undefined : typeSchemaFrom(options.inputs, "inputs"));
}
