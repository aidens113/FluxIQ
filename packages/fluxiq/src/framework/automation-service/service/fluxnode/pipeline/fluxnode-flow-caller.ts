import { fluxNodeSecretInputs } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../../core/index.ts";
import { PipelineError, type FlowCaller, type PipelineCallInvocation } from "../../pipelines/index.ts";
import type { FluxNodeRun } from "../fluxnode-run.ts";
import type { FluxNodeOwnerFlows } from "../owner-flows.ts";
import { PipelineCallEnded } from "./call-ended.ts";
import { isRegisteredPipeline } from "./is-registered-pipeline.ts";
import type { PipelineSecrets } from "./pipeline-secrets.ts";
import type { PipelineSpend } from "./spend.ts";
import type { FluxNodeRegistered } from "./registered.ts";

/** Starts a registered name as a run of its own with these inputs and answers the run, ended, or why it cannot start. */
type StartedChild = { run: FluxNodeRun; ended: Promise<unknown> } | { refusal: string };
export type FluxNodeChildRunner = (registered: FluxNodeRegistered, inputs: JsonObject, parent: FluxNodeRun, invocation?: PipelineCallInvocation) => StartedChild | Promise<StartedChild>;

/**
 * The pipeline's `FlowCaller`, bound to the FluxNode runner: a map step's `{ fluxNode: name }` target runs that
 * registered FluxNode with the record's inputs, as a full run of its own (replayed at no cost once learned),
 * tied to the pipeline by its correlation id. A record field mapped into the FluxNode's secret input
 * (`format: "secret"`) joins the pipeline run's secrets before the call starts (`./pipeline-secrets.ts`), so the call
 * runs in a frame that withholds it and the pipeline withholds it from then on. Only achieved gives outputs; any other ending is
 * `PipelineCallEnded`, which ends the pipeline the same way. The pipeline's Stop stops the call.
 */
export function fluxNodeFlowCaller(deps: { flows: Pick<FluxNodeOwnerFlows, "find">; runChild: FluxNodeChildRunner; parent: FluxNodeRun; spend: PipelineSpend; secrets: PipelineSecrets }): FlowCaller {
  const { parent } = deps;
  return async (target, inputs, signal, invocation) => {
    if (!("fluxNode" in target)) throw new PipelineError("pipeline.unsupported_target", "A pipeline calls a registered FluxNode by name; a call by Flow id is not available on this engine yet.");
    const found = await deps.flows.find(target.fluxNode);
    if ("missing" in found) throw new PipelineError("pipeline.unknown_fluxnode", `No FluxNode named "${target.fluxNode}" is registered on this engine.`);
    if (found.found.flowId === parent.target.flowId) throw new PipelineError("pipeline.self_call", `The pipeline "${target.fluxNode}" cannot call itself.`);
    if (!isRegisteredPipeline(found.found)) deps.secrets.meet(Object.values(fluxNodeSecretInputs(found.found.spec.inputs, inputs).values));
    const started = await deps.secrets.within(() => deps.runChild(found.found, inputs, parent, invocation));
    if ("refusal" in started) throw new PipelineError("pipeline.bad_call_inputs", started.refusal);
    const { run: child } = started;
    const stepId = `call.${child.runId}`.slice(0, 128);
    parent.tell({ type: "step", flowId: parent.target.flowId, stepId, label: `Calling the FluxNode ${target.fluxNode} (run ${child.runId}).`.slice(0, 200), state: "started" });
    const stopIt = (): void => child.stop("The pipeline was stopped.");
    if (signal?.aborted === true) stopIt();
    else signal?.addEventListener("abort", stopIt, { once: true });
    try {
      await started.ended;
    } finally {
      signal?.removeEventListener("abort", stopIt);
    }
    const called = child.result;
    if (called === undefined) throw new PipelineError("pipeline.call_unfinished", `The run of "${target.fluxNode}" finished with no result.`);
    deps.spend.add(called);
    parent.tell({ type: "step", flowId: parent.target.flowId, stepId, label: `The FluxNode ${target.fluxNode} ended ${called.status}.`.slice(0, 200), state: called.status === "achieved" ? "succeeded" : "failed" });
    if (called.status !== "achieved") throw new PipelineCallEnded(called);
    return { outputs: deps.secrets.withheld(called.outputs ?? null), lineage: called.lineage ?? [] };
  };
}
