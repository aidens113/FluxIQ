// One data pipeline run (fluxnode-plan D3): the pipeline's compiled Flow, run through the pipeline module's
// own executors (`runCompiledPipelineFlow`), with the ports a run needs bound here: a map step's FluxNode
// call runs that registered FluxNode as a full run of its own (`./fluxnode-flow-caller.ts`), the program's
// callbacks go over `transform_needed` (`./pipeline-sdk-port.ts`), and sinks store in memory.
//
// **The ending.** The pipeline completing is `achieved`. A mapped call that ends budget_out, stopped or
// waiting ends the pipeline the same way (there is no failed ending), with the cost so far; the records of
// the steps before it are not kept. The program's Stop (or `timeoutMs`) aborts the pipeline and stops the
// call under way. A step that cannot run as declared (a callback that raised, a type the records do not
// fit, a port that was never given) ends the run `stopped` after a failed step event naming why.

import { resolveFluxNodeOptions, type FluxNodeVerdict } from "@fluxiq/contracts/fluxnode";
import { PipelineError, PipelineRejectedError, compilePipeline, runCompiledPipelineFlow, type PipelineRunContext, type PipelineRunOutcome } from "../../pipelines/index.ts";
import type { FluxNodeRun } from "../fluxnode-run.ts";
import type { FluxNodeRunOutcome } from "../run-fluxnode.ts";
import { fluxNodeFlowCaller } from "./fluxnode-flow-caller.ts";
import type { FluxNodePipelineContext } from "./fluxnode-pipeline-context.ts";
import { PipelineCallEnded } from "./call-ended.ts";
import { fluxNodePipelineResult, type PipelineResultInput } from "./result.ts";
import { pipelineSdkPort } from "./sdk-port.ts";
import { PipelineSecrets } from "./pipeline-secrets.ts";
import { PipelineSpend } from "./spend.ts";
import { fluxNodePipelineStateWithoutSecrets } from "./secret-safe-state.ts";
import { withheldDatasetWriter } from "./withheld-dataset-writer.ts";
import type { FluxNodeRegisteredPipeline } from "./registered-pipeline.ts";

const NO_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
const MOST_WORDS = 400;

export async function runFluxNodePipeline(context: FluxNodePipelineContext, run: FluxNodeRun, registered: FluxNodeRegisteredPipeline, resumeHandle: string): Promise<FluxNodeRunOutcome> {
  const { pipeline } = registered;
  const options = resolveFluxNodeOptions(undefined, run.carried.options);
  run.budgetUsd = options.budgetUsd;
  const spend = new PipelineSpend();
  // The secret values record fields give mapped calls, withheld from here on everywhere the pipeline keeps or shows them (`./pipeline-secrets.ts`).
  const secrets = new PipelineSecrets((texts) => run.withhold(texts));
  const abort = new AbortController();
  run.whenStopped(() => abort.abort());
  const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => run.stop("The run's time ran out."), options.timeoutMs);
  const ports: PipelineRunContext["ports"] = {
    callFlow: fluxNodeFlowCaller({ flows: context.flows, runChild: context.runChild, parent: run, spend, secrets }),
    writeDataset: withheldDatasetWriter(context.datasets.writerFor(run.runId), secrets), readDataset: context.datasets.read, state: await fluxNodePipelineStateWithoutSecrets(context.state, pipeline, context.flows), sdk: pipelineSdkPort(run), now: context.now,
    ...(context.fetch === undefined ? {} : { fetch: context.fetch }), ...(context.writeFile === undefined ? {} : { writeFile: context.writeFile })
  };
  const finished = (fields: Omit<PipelineResultInput, "run" | "registered" | "path" | "cost" | "resumeHandle" | "endedAt">): FluxNodeRunOutcome => ({
    result: fluxNodePipelineResult({ run, registered, path: spend.path, cost: spend.total, resumeHandle, endedAt: context.now(), ...fields })
  });
  try {
    if (run.stopRequested) return finished({ status: "stopped" });
    const outcome: PipelineRunOutcome = await runCompiledPipelineFlow(compilePipeline(pipeline), { runId: run.runId, flowId: registered.flowId, projectId: registered.projectId, pipeline: registered.name, inputs: run.carried.inputs, ports, signal: abort.signal });
    const verdict: FluxNodeVerdict = pipeline.outputs === undefined ? { label: "unverified" } : { label: "confirmed", by: "type" };
    return finished({ status: "achieved", records: outcome.records, datasets: outcome.datasets, verdict });
  } catch (error) {
    if (error instanceof PipelineCallEnded) return finished({ status: error.called.status, ...(error.called.waitingFor === undefined ? {} : { waitingFor: error.called.waitingFor }) });
    if (!(error instanceof PipelineError)) throw error;
    if (error.code === "pipeline.aborted" || run.stopRequested) return finished({ status: "stopped" });
    run.tell({ type: "step", flowId: registered.flowId, stepId: (error.stepId ?? "pipeline").replace(/[^A-Za-z0-9._:-]/gu, "_").slice(0, 128), label: `The pipeline could not go on: ${error.message}`.replace(NO_CONTROL, " ").slice(0, 200), state: "failed" });
    const refuted: FluxNodeVerdict | undefined = error instanceof PipelineRejectedError ? { label: "refuted", by: "type", reason: error.message.replace(NO_CONTROL, " ").slice(0, MOST_WORDS) } : undefined;
    return finished({ status: "stopped", ...(refuted ? { verdict: refuted } : {}) });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
