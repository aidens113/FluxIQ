// What a pipeline run gives back: the final records, typed by the program.

import type { FluxNodeRunResult } from "@fluxiq/contracts/fluxnode";
import type { UnfinishedRun } from "./run-types.ts";

/** A pipeline run that completed: `outputs` is the final records, each checked against the pipeline's declared type. */
export type AchievedPipelineRun<R> = Omit<FluxNodeRunResult, "status" | "outputs"> & { status: "achieved"; outputs: R[] };

/** Every way a pipeline run ends. Narrow on `status` to get the typed records. */
export type PipelineOutcome<R> = AchievedPipelineRun<R> | UnfinishedRun;
