// A reference to a stored dataset: the record sets every run already collects
// (`@fluxiq/contracts/automation` record sets), named rather than copied, so a result
// or a pipeline step can point at rows without carrying them.

import { z } from "zod";
import { fluxNodeFieldSchemas } from "../fields/index.ts";

/** `datasetId` names the dataset; `runId` the run that collected it, when one did; `rowCount` how many rows it held when referenced. */
export const datasetRefSchema = z
  .object({
    datasetId: fluxNodeFieldSchemas.id,
    runId: fluxNodeFieldSchemas.id.optional(),
    name: fluxNodeFieldSchemas.shortText.optional(),
    rowCount: fluxNodeFieldSchemas.count.optional()
  })
  .strict();

export type DatasetRef = z.infer<typeof datasetRefSchema>;
