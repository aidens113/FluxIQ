import type { DataLineage, DatasetRef, FluxNodeCost, FluxNodeRunPathKind, FluxNodeRunResult, FluxNodeRunStatus, FluxNodeVerdict } from "@fluxiq/contracts/fluxnode";
import type { JsonValue } from "../../../../../core/index.ts";
import type { PipelineRecord } from "../../pipelines/index.ts";
import type { FluxNodeRun } from "../fluxnode-run.ts";
import { fluxNodeInferredType } from "../outputs/index.ts";
import type { FluxNodeRegisteredPipeline } from "./registered-pipeline.ts";

const MOST_LINEAGE = 1000;
const MOST_DATASETS = 64;

export type PipelineResultInput = {
  run: FluxNodeRun;
  registered: FluxNodeRegisteredPipeline;
  status: FluxNodeRunStatus;
  /** The final records, when the pipeline completed. */
  records?: readonly PipelineRecord[] | undefined;
  datasets?: readonly DatasetRef[] | undefined;
  verdict?: FluxNodeVerdict | undefined;
  path: FluxNodeRunPathKind;
  cost: FluxNodeCost;
  resumeHandle: string;
  waitingFor?: string | undefined;
  endedAt: number;
};

/**
 * A pipeline run's result in the contracts' terms. The outputs are the final records' data, each checked
 * against the declared type before they get here; with none declared the type is inferred, as a FluxNode's is.
 * Each record's lineage is moved to point into the outputs at its position. The
 * result's `specHash` is the pipeline's hash.
 */
export function fluxNodePipelineResult(input: PipelineResultInput): FluxNodeRunResult {
  const { run, registered, status } = input;
  const outputs: JsonValue | undefined = input.records === undefined ? undefined : input.records.map((record) => record.data);
  const lineage: DataLineage[] = (input.records ?? []).flatMap((record, index) => record.lineage.map((entry) => ({ ...entry, pointer: `/${index}${entry.pointer}` }))).slice(0, MOST_LINEAGE);
  const datasets = (input.datasets ?? []).slice(0, MOST_DATASETS);
  return {
    runId: run.runId, name: run.target.name, specHash: registered.specHash, flowId: run.target.flowId, flowPath: run.target.flowPath, status,
    ...(outputs === undefined ? {} : { outputs }),
    ...(outputs !== undefined && registered.pipeline.outputs === undefined ? { outputsType: fluxNodeInferredType(outputs) } : {}),
    verdict: input.verdict ?? { label: "unverified" },
    path: input.path,
    cost: input.cost,
    timings: { startedAt: run.startedAt, endedAt: Math.max(run.startedAt, input.endedAt), durationMs: Math.max(0, input.endedAt - run.startedAt) },
    ...(status === "budget_out" || status === "waiting_for_person" ? { resumeHandle: input.resumeHandle } : {}),
    ...(status === "waiting_for_person" ? { waitingFor: input.waitingFor ?? "A person needs to act before the run can go on." } : {}),
    ...(lineage.length ? { lineage } : {}),
    ...(datasets.length ? { datasets } : {}),
    ...(run.carried.correlationId === undefined ? {} : { correlationId: run.carried.correlationId })
  };
}
