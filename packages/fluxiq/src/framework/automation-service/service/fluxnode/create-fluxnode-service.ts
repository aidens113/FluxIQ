// The FluxNode runner behind the FluxNode HTTP API (`./fluxnode-service.ts`; fluxnode-plan N9): what a
// headless server builds from a FluxIQ instance,
//
//   createFluxNodeService({ service: fluxiq.programs.automationStudio, domainId: fluxiq.activeDomainId })
//
// Each endpoint checks what only Core can (a registered name, inputs against the registered spec, an
// event that waits, a run that has not ended) and answers a refusal in the contracts' codes. A run is
// started and returned at once as `running`; it goes on after the call (`./run-fluxnode.ts`), and its
// events and `get` tell how it went. Runs are held in memory (`./run-registry.ts`).
//
// **A pipeline is run here too** (`./pipeline/`): registered by name under its `dataPipelineHash` beside the
// FluxNodes, started by `pipeline` or by name, with the same events, stop and result. Its map steps run
// registered FluxNodes as runs of their own, through the same registry and run code as any run.
//
// **A run that throws** is Core failing, not the task: it ends `stopped` with what it had, after a
// failed step event naming only the error's kind. There is no `failed` ending to give it.

import { randomUUID } from "node:crypto";
import { checkFluxNodeRunInputs, fillFluxNodeGoal, fluxNodeApiPath, type FluxNodeIssue, type FluxNodeRunRequest, type FluxNodeSpec } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmModelCaller } from "../../../../runtime/llm/index.ts";
import type { AutomationStudioService } from "../../service.ts";
import { fluxNodeEventStream } from "./events/index.ts";
import { fluxNodeFlowExport } from "./flow-export.ts";
import { FluxNodeRun, type FluxNodeRunCarried } from "./fluxnode-run.ts";
import type { FluxNodeService, FluxNodeServiceOutcome, FluxNodeServiceRefusal } from "./fluxnode-service.ts";
import { FluxNodeOwnerFlows } from "./owner-flows.ts";
import { createPipelineDatasets, fluxNodePipelineResult, isRegisteredPipeline, pipelineInputIssues, runFluxNodePipeline, type FluxNodePipelineContext, type FluxNodeRegistered } from "./pipeline/index.ts";
import { fluxNodeResultOf } from "./result-of.ts";
import { runFluxNode, type FluxNodeRunContext } from "./run-fluxnode.ts";
import { FluxNodeRunRegistry } from "./run-registry.ts";
import { createMemoryPipelineState, type PipelineFetch, type PipelineFileWriter, type PipelineState } from "../pipelines/index.ts";

/** What the runner is built from. Only `service` is needed; the rest default as a local engine wants. */
export type FluxNodeServiceSource = {
  service: AutomationStudioService;
  /** The domain the owner project is for: the instance's active one. */
  domainId?: string | null | undefined;
  /** Whose key pays for the attempts' model calls. Defaults to the local owner. */
  modelCaller?: AutomationStudioLlmModelCaller | undefined;
  /** Where an attempt starts. Defaults to the spec's `start`. */
  startLocationOf?: ((spec: FluxNodeSpec) => string | undefined) | undefined;
  /** How long a `person_needed` event waits before the run waits for a person instead. Defaults to 10 minutes. */
  personWaitMs?: number | undefined;
  /** How long `stop` waits for the run to end before answering with its state. Defaults to 30 seconds. */
  stopWaitMs?: number | undefined;
  now?: (() => number) | undefined;
  /** What pipelines remember between runs (incremental keys, cached calls). Defaults to memory, which a restart forgets. */
  pipelineState?: PipelineState | undefined;
  /** A pipeline webhook sink's POST. Defaults to the global `fetch`. */
  pipelineFetch?: PipelineFetch | undefined;
  /** A pipeline file sink's writer, confined to the host's directory (`createDirectoryFileWriter`). Defaults to none: file sinks cannot run. */
  pipelineWriteFile?: PipelineFileWriter | undefined;
};

const OWNER: AutomationStudioLlmModelCaller = { actorUserId: "fluxnode.owner", actorSessionId: "fluxnode.open-mode" };
const PERSON_WAIT_MS = 10 * 60 * 1000;
const STOP_WAIT_MS = 30_000;

const ok = <T>(value: T): FluxNodeServiceOutcome<T> => ({ ok: true, value });
const refuse = <T>(refusal: FluxNodeServiceRefusal): FluxNodeServiceOutcome<T> => ({ ok: false, refusal });

export function createFluxNodeService(source: FluxNodeServiceSource): FluxNodeService {
  const now = source.now ?? Date.now;
  const flows = new FluxNodeOwnerFlows(source.service, source.domainId, now);
  const runs = new FluxNodeRunRegistry();
  const context: FluxNodeRunContext = {
    service: source.service, flows, modelCaller: source.modelCaller ?? OWNER, now,
    startLocationOf: source.startLocationOf ?? ((spec) => spec.start), personWaitMs: source.personWaitMs ?? PERSON_WAIT_MS
  };

  const pipelines: FluxNodePipelineContext = {
    flows, datasets: createPipelineDatasets(), state: source.pipelineState ?? createMemoryPipelineState(), now,
    fetch: source.pipelineFetch ?? postWithGlobalFetch, writeFile: source.pipelineWriteFile,
    runChild: (registered, inputs, parent) => {
      const carried: FluxNodeRunCarried = { inputs, ...(parent.carried.options === undefined ? {} : { options: parent.carried.options }), correlationId: parent.carried.correlationId ?? parent.runId };
      const issues = inputIssuesOf(registered, inputs);
      if (issues.length) return { refusal: `The inputs of a call to "${registered.name}" do not fit it: ${issues[0]?.path ?? ""} ${issues[0]?.message ?? ""}`.trim() };
      const run = launch(registered, carried, undefined);
      return { run, ended: runs.get(run.runId)!.finished };
    }
  };

  const launch = (registered: FluxNodeRegistered, carried: FluxNodeRunCarried, key: { key: string; request: unknown } | undefined): FluxNodeRun => {
    const runId = `fnr-${randomUUID()}`;
    const run = new FluxNodeRun(runId, { name: registered.name, specHash: registered.specHash, projectId: registered.projectId, flowId: registered.flowId, flowPath: registered.flowPath }, carried, fluxNodeApiPath("runEvents", { runId }), now);
    runs.add(run, registered, async () => await finish(context, pipelines, runs, run, registered), key);
    return run;
  };

  return {
    async register(_caller, request) {
      const { spec, pipeline } = request;
      const done = spec !== undefined && pipeline === undefined ? await flows.register(spec) : pipeline !== undefined && spec === undefined ? await flows.registerPipeline(pipeline) : undefined;
      if (!done) return refuse({ code: "invalid_request", message: "Give exactly one of spec and pipeline." });
      return ok({ name: done.registered.name, specHash: done.registered.specHash, flowPath: done.registered.flowPath, created: done.created, ...(done.previousSpecHash === undefined ? {} : { previousSpecHash: done.previousSpecHash }) });
    },

    async start(_caller, request) {
      const keyed = runs.keyed(request.idempotencyKey, request);
      if (keyed === "conflict") return refuse({ code: "idempotency_conflict", message: "That idempotency key was used with a different request." });
      if (keyed) return ok(runs.get(keyed.runId)!.run.state());
      const target = await targetOf(flows, runs, request);
      if ("refusal" in target) return refuse(target.refusal);
      const issues = inputIssuesOf(target.registered, target.carried.inputs);
      if (issues.length) return refuse({ code: "invalid_inputs", message: "The inputs do not fit this FluxNode.", issues });
      const run = launch(target.registered, target.carried, request.idempotencyKey === undefined ? undefined : { key: request.idempotencyKey, request });
      return ok(run.state());
    },

    async get(_caller, runId) {
      const held = runs.get(runId);
      return held ? ok(held.run.state()) : refuse({ code: "unknown_run", message: "No run has that id." });
    },

    async events(_caller, runId, afterSeq, signal) {
      const held = runs.get(runId);
      return held ? ok(fluxNodeEventStream(held.run, afterSeq, signal)) : refuse({ code: "unknown_run", message: "No run has that id." });
    },

    async answer(_caller, runId, answer) {
      const held = runs.get(runId);
      if (!held) return refuse({ code: "unknown_run", message: "No run has that id." });
      const refused = held.run.answer(answer);
      return refused ? refuse(refused) : ok({ accepted: true as const });
    },

    async stop(_caller, runId, request) {
      const held = runs.get(runId);
      if (!held) return refuse({ code: "unknown_run", message: "No run has that id." });
      if (held.run.result) return refuse({ code: "run_ended", message: "This run has already ended." });
      held.run.stop(request.reason);
      await settledWithin(held.finished, source.stopWaitMs ?? STOP_WAIT_MS);
      return ok(held.run.state());
    },

    async list(_caller, query) {
      return ok(runs.list(query));
    },

    async exportFlow(_caller, name, request) {
      const found = await flows.find(name, request.specHash);
      if ("missing" in found) return refuse(found.missing === "name" ? { code: "unknown_fluxnode", message: "No FluxNode has that name." } : { code: "unknown_spec_hash", message: "That FluxNode has no spec with that hash." });
      return ok(await fluxNodeFlowExport(source.service, runs, found.found, request.pin, now()));
    }
  };
}

type Target = { registered: FluxNodeRegistered; carried: FluxNodeRunCarried } | { refusal: FluxNodeServiceRefusal };

/** What a request runs: an inline spec, registered on the way; a registered name; or the run a resume handle continues. */
async function targetOf(flows: FluxNodeOwnerFlows, runs: FluxNodeRunRegistry, request: FluxNodeRunRequest): Promise<Target> {
  const carried = (inputs: JsonObject): FluxNodeRunCarried => ({ inputs, ...(request.options === undefined ? {} : { options: request.options }), ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }) });
  if (request.spec !== undefined) return { registered: (await flows.register(request.spec)).registered, carried: carried(request.inputs ?? {}) };
  if (request.pipeline !== undefined) return { registered: (await flows.registerPipeline(request.pipeline)).registered, carried: carried(request.inputs ?? {}) };
  if (request.name !== undefined) {
    const found = await flows.find(request.name, request.specHash);
    if ("missing" in found) return { refusal: found.missing === "name" ? { code: "unknown_fluxnode", message: "No FluxNode has that name." } : { code: "unknown_spec_hash", message: "That FluxNode has no spec with that hash." } };
    return { registered: found.found, carried: carried(request.inputs ?? {}) };
  }
  const held = request.resumeHandle === undefined ? undefined : runs.resumable(request.resumeHandle);
  if (!held) return { refusal: { code: "unknown_run", message: "That resume handle names no run this engine can continue." } };
  // The same inputs, key and options; a correlation id given now ties this run in, else the first one's.
  return { registered: held.registered, carried: { ...held.run.carried, ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }) } };
}

function inputIssuesOf(registered: FluxNodeRegistered, inputs: JsonObject): FluxNodeIssue[] {
  return isRegisteredPipeline(registered) ? pipelineInputIssues(registered.pipeline, inputs) : inputIssues(registered.spec, inputs);
}

function inputIssues(spec: FluxNodeSpec, inputs: JsonObject): FluxNodeIssue[] {
  const issues = checkFluxNodeRunInputs(spec, inputs);
  if (issues.length) return issues;
  const goal = fillFluxNodeGoal(spec.goal, inputs);
  return goal.ok ? [] : goal.issues;
}

/** Runs the attempt and ends the run with its result. Never rejects: a throw ends the run `stopped`. */
async function finish(context: FluxNodeRunContext, pipelines: FluxNodePipelineContext, runs: FluxNodeRunRegistry, run: FluxNodeRun, registered: FluxNodeRegistered): Promise<void> {
  const resumeHandle = runs.resumeHandleOf(run.runId);
  try {
    const outcome = isRegisteredPipeline(registered) ? await runFluxNodePipeline(pipelines, run, registered, resumeHandle) : await runFluxNode(context, run, registered, resumeHandle);
    if (outcome.learned) runs.learned(registered.flowId, outcome.learned);
    run.end(outcome.result);
  } catch (error) {
    run.tell({ type: "step", flowId: registered.flowId, stepId: "fluxnode.run", label: `Core could not run this FluxNode (${error instanceof Error ? error.name : "unknown error"}).`, state: "failed" });
    const endedAt = context.now();
    run.end(isRegisteredPipeline(registered)
      ? fluxNodePipelineResult({ run, registered, status: "stopped", path: "replayed", cost: { calls: 0, tokens: 0, usd: 0 }, resumeHandle, endedAt })
      : await fluxNodeResultOf({ run, spec: registered.spec, inputs: run.carried.inputs, answered: undefined, bridge: undefined, owner: context.service, resumeHandle, endedAt }));
  }
}

/** The default webhook POST: the runtime's own `fetch`. */
const postWithGlobalFetch: PipelineFetch = async (url, init) => await fetch(url, { method: init.method, headers: init.headers, body: init.body, ...(init.signal === undefined ? {} : { signal: init.signal }) });

async function settledWithin(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work.then(() => undefined, () => undefined), new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); })]);
  if (timer !== undefined) clearTimeout(timer);
}
