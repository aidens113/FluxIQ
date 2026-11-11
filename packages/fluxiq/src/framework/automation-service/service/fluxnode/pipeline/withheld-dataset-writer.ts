import type { PipelineDatasetWriter } from "../../pipelines/index.ts";
import type { PipelineSecrets } from "./pipeline-secrets.ts";

/** A dataset writer that stores its records with the run's secret values withheld, as of the moment it writes. */
export function withheldDatasetWriter(write: PipelineDatasetWriter, secrets: PipelineSecrets): PipelineDatasetWriter {
  return async (name, records) => await write(name, secrets.withheld(records));
}
