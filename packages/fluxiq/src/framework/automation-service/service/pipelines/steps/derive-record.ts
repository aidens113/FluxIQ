import type { DataLineage } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../../core/index.ts";
import { PIPELINE_LINEAGE_LIMIT, type PipelineRecord, type PipelineRunContext } from "../types.ts";

/**
 * A record a data step computed: the lineage it carried in, plus one `derived` entry
 * naming this step and the pointers (into the step input list) it came from. When
 * the list passes its limit the oldest entries after the first are dropped, so the
 * origin and the latest step both stay.
 */
export function deriveRecord(context: PipelineRunContext, stepId: string, data: JsonObject, from: readonly string[], carried: readonly DataLineage[]): PipelineRecord {
  const pointers = from.slice(0, 64);
  const entry: DataLineage = {
    pointer: "",
    runId: context.runId,
    ...(context.flowId === undefined ? {} : { flowId: context.flowId }),
    stepId,
    source: { kind: "derived", from: pointers.length > 0 ? pointers : [""] }
  };
  const all = [...carried, entry];
  if (all.length <= PIPELINE_LINEAGE_LIMIT) return { data, lineage: all };
  return { data, lineage: [...all.slice(0, PIPELINE_LINEAGE_LIMIT - 1), entry] };
}
