// A pipeline with a name and no source yet: choose where its records come from.

import type { DataExpression, DataFieldPath } from "@fluxiq/contracts/fluxnode";
import { flowTarget, type FlowTargetInput } from "./flow-target.ts";
import { PipelineBuilder } from "./step-builder.ts";

export class PipelineStart {
  readonly #name: string;
  readonly #inputs: unknown;

  constructor(name: string, inputs: unknown) {
    this.#name = name;
    this.#inputs = inputs;
  }

  /** Starts from a stored dataset, by its id. */
  fromDataset(datasetId: string): PipelineBuilder {
    return new PipelineBuilder({ name: this.#name, inputs: this.#inputs, source: { kind: "dataset", dataset: { datasetId } } });
  }

  /** Starts from a list in the pipeline's inputs, at `field`. */
  fromInput(field: DataFieldPath): PipelineBuilder {
    return new PipelineBuilder({ name: this.#name, inputs: this.#inputs, source: { kind: "input", field } });
  }

  /** Starts from the outputs of a FluxNode (or Flow) called once, with `inputs` built from the pipeline's inputs. */
  fromFlow(target: FlowTargetInput, inputs: Record<string, DataExpression> = {}): PipelineBuilder {
    return new PipelineBuilder({ name: this.#name, inputs: this.#inputs, source: { kind: "flow", target: flowTarget(target), inputs } });
  }
}
