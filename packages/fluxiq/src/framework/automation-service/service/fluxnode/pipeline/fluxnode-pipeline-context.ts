import type { PipelineFetch, PipelineFileWriter, PipelineState } from "../../pipelines/index.ts";
import type { FluxNodeOwnerFlows } from "../owner-flows.ts";
import type { FluxNodeChildRunner } from "./fluxnode-flow-caller.ts";
import type { PipelineDatasets } from "./datasets.ts";

/** What a pipeline run is given by the runner that holds it. */
export type FluxNodePipelineContext = {
  flows: Pick<FluxNodeOwnerFlows, "find">;
  runChild: FluxNodeChildRunner;
  datasets: PipelineDatasets;
  /** What pipelines remember between runs (incremental keys, cached calls); in memory unless the host gives its own. */
  state: PipelineState;
  /** A webhook sink's POST. Without it a webhook step cannot run. */
  fetch?: PipelineFetch | undefined;
  /** A file sink's writer, confined to the host's directory. Without it a file step cannot run. */
  writeFile?: PipelineFileWriter | undefined;
  now: () => number;
};
