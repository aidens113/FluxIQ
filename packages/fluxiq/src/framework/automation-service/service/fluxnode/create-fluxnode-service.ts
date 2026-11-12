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
//
// **A pin is enforced on every run** (`./pin/`): kept with the Flow, read as each run starts.
//
// **Each run's lasting acts are its own** (`./act-scope/`): scoped as it is launched by its idempotency key
// and request, or its own id; a resume keeps the first run's scope, and a pipeline's child runs are runs.

import { createHash, randomUUID } from "node:crypto";
import { checkFluxNodeRunInputs, fillFluxNodeGoal, FLUXNODE_PIPELINE_OVERRIDES_MESSAGE, fluxNodeApiPath, fluxNodeSecretInputs, resolveFluxNodeOptions, type FluxNodeIssue, type FluxNodeRunRequest, type FluxNodeRunResult, type FluxNodeSpec } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmModelCaller } from "../../../../runtime/llm/index.ts";
import type { AutomationStudioService } from "../../service.ts";
import { FluxNodeIdempotencyKeys, fluxNodeActScope, fluxNodeChildActScope, fluxNodeExecutionOwner, fluxNodeRequestIdentity, fluxNodeSecretBindings, fluxNodeScopedMemoryProblem, fluxNodeExecutionTask, fluxNodeExecutionTargets } from "./act-scope/index.ts";
import { fluxNodeCallerKey } from "./caller-key.ts";
import { fluxNodeEventStream } from "./events/index.ts";
import { fluxNodeFlowExport } from "./flow-export.ts";
import { FluxNodeRun, type FluxNodeRunCarried } from "./fluxnode-run.ts";
import type { FluxNodeService, FluxNodeServiceOutcome, FluxNodeServiceRefusal } from "./fluxnode-service.ts";
import { FluxNodeOwnerFlows } from "./owner-flows.ts";
import { FluxNodePins } from "./pin/index.ts";
import { createPipelineDatasets, fluxNodePipelineResult, isRegisteredPipeline, pipelineInputIssues, runFluxNodePipeline, type FluxNodePipelineContext, type FluxNodeRegistered } from "./pipeline/index.ts";
import { fluxNodeResultOf } from "./result-of.ts";
import { runFluxNode, type FluxNodeRunContext } from "./run-fluxnode.ts";
import { FluxNodeRunRegistry } from "./run-registry.ts";
import type { FluxNodeHostPool } from "./hosts/index.ts";
import { createMemoryPipelineState, type PipelineFetch, type PipelineFileWriter, type PipelineState } from "../pipelines/index.ts";

/** What the runner is built from. Only `service` is needed; the rest default as a local engine wants. */
export type FluxNodeServiceSource = {
  service: AutomationStudioService;
  /** The domain the owner project is for: the instance's active one. */
  domainId?: string | null | undefined;
  /** The active domain's leased execution resources. Pipeline controllers acquire only through their leaf calls. */
  hosts?: Pick<FluxNodeHostPool, "domainId" | "run"> | undefined;
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
  if (source.hosts && source.domainId !== source.hosts.domainId) throw new Error("managed_host.domain_mismatch: The pool must serve the instance's explicitly bound domain.");
  const now = source.now ?? Date.now;
  const flows = new FluxNodeOwnerFlows(source.service, source.domainId, now);
  const runs = new FluxNodeRunRegistry();
  const keys = new FluxNodeIdempotencyKeys(source.service);
  const activeScopes = new Map<string, FluxNodeRun>();
  const pins = new FluxNodePins(source.service, flows, now);
  const context: FluxNodeRunContext = {
    service: source.service, flows, pins, hosts: source.hosts, modelCaller: source.modelCaller ?? OWNER, now,
    startLocationOf: source.startLocationOf ?? ((spec) => spec.start), personWaitMs: source.personWaitMs ?? PERSON_WAIT_MS,
    judgedWith: (flowId) => runs.judgedWith(flowId)
  };

  const pipelines: FluxNodePipelineContext = {
    service: source.service, flows, datasets: createPipelineDatasets(), state: source.pipelineState ?? createMemoryPipelineState(), now,
    fetch: source.pipelineFetch ?? postWithGlobalFetch, writeFile: source.pipelineWriteFile,
    runChild: async (registered, inputs, parent, invocation) => {
      if (!runs.accepting) return { refusal: "The FluxNode service is closing." };
      const actScope = invocation && parent.carried.actScope ? fluxNodeChildActScope(parent.carried.actScope, invocation, registered) : undefined;
      const carried: FluxNodeRunCarried = { inputs, ...(actScope === undefined ? {} : { actScope }), ...(parent.carried.options === undefined ? {} : { options: parent.carried.options }), correlationId: parent.carried.correlationId ?? parent.runId };
      const issues = inputIssuesOf(registered, inputs);
      if (issues.length) return { refusal: `The inputs of a call to "${registered.name}" do not fit it: ${issues[0]?.path ?? ""} ${issues[0]?.message ?? ""}`.trim() };
      const run = await launch(registered, carried, undefined, parent.carried.targets);
      if (!run) return { refusal: runs.accepting ? "Another live or unverified engine owns this child execution." : "The FluxNode service is closing." };
      if ("unreadable" in run) return { refusal: run.unreadable.message };
      return { run, ended: runs.get(run.runId)!.finished };
    }
  };

  const launch = async (registered: FluxNodeRegistered, carried: FluxNodeRunCarried, key: { key: string; request: unknown; scope: string } | undefined, admittedTargets?: Readonly<Record<string, string>>): Promise<FluxNodeRun | { unreadable: Error } | undefined> => {
    if (!runs.accepting) return undefined;
    return await runs.track(async () => {
    const runId = `fnr-${randomUUID()}`;
    // A secret input's value is withheld from everything the run tells (`./secrets/`); a pipeline declares none.
    const secrets = isRegisteredPipeline(registered) ? [] : Object.values(fluxNodeSecretInputs(registered.spec.inputs, carried.inputs).values);
    // Whose lasting acts this run's are (`./act-scope/`): a resume's first run's, a key's first run's, else its own.
    const scoped: FluxNodeRunCarried = { ...carried, inputs: structuredClone(carried.inputs), actScope: carried.actScope ?? fluxNodeActScope({ runId, keyScope: key?.scope }) };
    const scope = JSON.stringify([registered.projectId, scoped.actScope]);
    return await keys.execution(scope, async () => {
      const held = activeScopes.get(scope);
      if (held && !held.result) return held;
      const owner = source.service.projectPaths.root ? await fluxNodeExecutionOwner(source.service.projectPaths.projectFile(registered.projectId, "fluxnode", "executions", `${createHash("sha256").update(scoped.actScope!).digest("hex")}.owner`)) : { release: async () => undefined };
      if (!owner) return undefined;
      let run: FluxNodeRun | undefined;
      const cleanup = async (): Promise<void> => {
        try { await owner.release(); }
        finally { if (run && activeScopes.get(scope) === run) activeScopes.delete(scope); }
      };
      let unreadable: Error | undefined;
      try {
        unreadable = await fluxNodeScopedMemoryProblem({ service: source.service, registered, scope: scoped.actScope!, taskKey: scoped.taskKey });
        if (unreadable) throw unreadable;
        const targets = await fluxNodeExecutionTargets(registered, flows, admittedTargets);
        if ("problem" in targets) {
          unreadable = targets.problem;
          throw unreadable;
        }
        const binding = await fluxNodeExecutionTask({
          file: source.service.projectPaths.root ? source.service.projectPaths.projectFile(registered.projectId, "fluxnode", "executions", `${createHash("sha256").update(scoped.actScope!).digest("hex")}.json`) : undefined,
          owner: source.service, identity: { projectId: registered.projectId, name: registered.name, specHash: registered.specHash, scope: scoped.actScope!, targets: targets.targets },
          choose: async () => {
            if (scoped.taskKey !== undefined) return scoped.taskKey;
            if (isRegisteredPipeline(registered)) return fluxNodeCallerKey(registered);
            const options = resolveFluxNodeOptions(registered.spec.options, scoped.options);
            return fluxNodeCallerKey({ ...registered, ...(options.mode === "explore" ? { explore: scoped.actScope } : { pinned: Boolean((await pins.view(registered)).record) }) });
          }
        });
        if ("problem" in binding) {
          unreadable = binding.problem;
          throw unreadable;
        }
        scoped.taskKey = binding.taskKey;
        scoped.targets = binding.targets;
        const made = new FluxNodeRun(runId, { name: registered.name, specHash: registered.specHash, projectId: registered.projectId, flowId: registered.flowId, flowPath: registered.flowPath }, scoped, fluxNodeApiPath("runEvents", { runId }), now, secrets);
        run = made;
        activeScopes.set(scope, made);
        runs.add(made, registered, async () => {
          let released: Promise<void> | undefined;
          const release = (): Promise<void> => released ??= (async () => {
            try { await cleanup(); }
            catch (error) {
              runs.finalizationFailed(error);
              made.tell({ type: "step", flowId: registered.flowId, stepId: "execution.ownership", label: `Core could not release execution ownership (${error instanceof Error ? error.name : "unknown error"}).`, state: "failed" });
            }
          })();
          let result: FluxNodeRunResult;
          try { result = await finish(context, pipelines, runs, made, registered, release); }
          finally { await release(); }
          made.end(result);
        }, key);
        return made;
      } catch (error) {
        try { await cleanup(); }
        catch (cleanupError) {
          runs.finalizationFailed(cleanupError);
          throw new AggregateError([error, cleanupError], "Core could not register the run and release execution ownership.");
        }
        if (unreadable && error === unreadable) return { unreadable };
        throw error;
      }
    });
    });
  };

  return {
    close: () => runs.close(),
    async register(_caller, request) {
      if (!runs.accepting) return refuse({ code: "invalid_request", message: "The FluxNode service is closing." });
      return await runs.track(async () => {
      const { spec, pipeline } = request;
      if (pipeline !== undefined && spec === undefined) {
        const bindings = await fluxNodeSecretBindings({ pipeline }, {}, flows);
        if (bindings.problem) return refuse({ code: "invalid_request", message: bindings.problem });
      }
      const done = spec !== undefined && pipeline === undefined ? await flows.register(spec) : pipeline !== undefined && spec === undefined ? await flows.registerPipeline(pipeline) : undefined;
      if (!done) return refuse({ code: "invalid_request", message: "Give exactly one of spec and pipeline." });
      return ok({ name: done.registered.name, specHash: done.registered.specHash, flowPath: done.registered.flowPath, created: done.created, ...(done.previousSpecHash === undefined ? {} : { previousSpecHash: done.previousSpecHash }) });
      });
    },

    async start(caller, request) {
      if (!runs.accepting) return refuse({ code: "invalid_request", message: "The FluxNode service is closing." });
      request = structuredClone(request);
      return await runs.track(async () => {
      return await keys.start(request.idempotencyKey, async () => {
      if (source.hosts && request.spec !== undefined && request.spec.runtime !== source.hosts.domainId) return refuse({ code: "invalid_request", message: "This FluxNode must explicitly name the runtime served by this instance's managed host pool." });
      if (request.pipeline !== undefined) {
        const bindings = await fluxNodeSecretBindings({ pipeline: request.pipeline }, request.inputs ?? {}, flows);
        if (bindings.problem) return refuse({ code: "invalid_request", message: bindings.problem });
      }
      const target = await targetOf(flows, runs, request);
      if ("refusal" in target) return refuse(target.refusal);
      if (source.hosts && !isRegisteredPipeline(target.registered) && target.registered.spec.runtime !== source.hosts.domainId) return refuse({ code: "invalid_request", message: "This FluxNode must explicitly name the runtime served by this instance's managed host pool." });
      const issues = inputIssuesOf(target.registered, target.carried.inputs);
      if (issues.length) return refuse({ code: "invalid_inputs", message: "The inputs do not fit this FluxNode.", issues });
      if (isRegisteredPipeline(target.registered) && !source.service.runDatasets.available) return refuse({ code: "invalid_request", message: "A pipeline requires immutable source snapshot storage before it can start." });
      const targets = await fluxNodeExecutionTargets(target.registered, flows);
      if ("problem" in targets) return refuse({ code: "invalid_request", message: targets.problem.message });
      if (source.hosts) {
        for (const [name, specHash] of Object.entries(targets.targets ?? {})) {
          const resolved = await targets.flows.find(name, specHash);
          if ("missing" in resolved) return refuse({ code: "invalid_request", message: "A resolved FluxNode target is unavailable." });
          if (!isRegisteredPipeline(resolved.found) && resolved.found.spec.runtime !== source.hosts.domainId) return refuse({ code: "invalid_request", message: "Every FluxNode must explicitly name the runtime served by this instance's managed host pool." });
        }
      }
      const bindings = await fluxNodeSecretBindings(target.registered, target.carried.inputs, targets.flows, {
        privateDataset: async (snapshotId) => (await source.service.runDatasets.readImmutableSnapshotPage({ projectId: target.registered.projectId, snapshotId, limit: 1 })) !== null
      });
      if (bindings.problem) return refuse({ code: "invalid_request", message: bindings.problem });
      const identity = fluxNodeRequestIdentity(request, bindings.pointers);
      const previous = runs.keyed(request.idempotencyKey, identity.projection);
      if (previous === "conflict") return refuse({ code: "idempotency_conflict", message: "That idempotency key was used with a different request." });
      if (previous) return ok(runs.get(previous.runId)!.run.state());
      const claim = request.idempotencyKey === undefined ? undefined : await keys.claim(target.registered.projectId, caller, request.idempotencyKey, identity);
      if (claim === "conflict") return refuse({ code: "idempotency_conflict", message: "That idempotency key was used with a different request." });
      // Recheck after the serialized durable claim: concurrent starts must not both launch an execution.
      const keyed = runs.keyed(request.idempotencyKey, identity.projection);
      if (keyed) {
        return keyed === "conflict" ? refuse({ code: "idempotency_conflict", message: "That idempotency key was used with a different request." }) : ok(runs.get(keyed.runId)!.run.state());
      }
      if (claim === "busy") return refuse({ code: "invalid_request", message: "Another live or unverified engine owns this keyed execution. Continue through its owning engine before starting it here." });
      const run = await launch(target.registered, target.carried, request.idempotencyKey === undefined || !claim ? undefined : { key: request.idempotencyKey, request: identity.projection, scope: claim.scope }, targets.targets);
      if (!run) return refuse({ code: "invalid_request", message: runs.accepting ? "Another live or unverified engine owns this execution. Continue through its owning engine before starting it here." : "The FluxNode service is closing." });
      if ("unreadable" in run) return refuse({ code: "invalid_request", message: run.unreadable.message });
      return ok(run.state());
      });
      });
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
      if (!runs.accepting) return refuse({ code: "invalid_request", message: "The FluxNode service is closing." });
      return await runs.track(async () => {
      const found = await flows.find(name, request.specHash);
      if ("missing" in found) return refuse(found.missing === "name" ? { code: "unknown_fluxnode", message: "No FluxNode has that name." } : { code: "unknown_spec_hash", message: "That FluxNode has no spec with that hash." });
      return await fluxNodeFlowExport(source.service, runs, pins, found.found, request, now());
      });
    }
  };
}

type Target = { registered: FluxNodeRegistered; carried: FluxNodeRunCarried } | { refusal: FluxNodeServiceRefusal };

/** What a request runs: an inline spec, registered on the way; a registered name; or the run a resume handle continues. */
async function targetOf(flows: FluxNodeOwnerFlows, runs: FluxNodeRunRegistry, request: FluxNodeRunRequest): Promise<Target> {
  const carried = (inputs: JsonObject): FluxNodeRunCarried => ({ inputs, ...(request.options === undefined ? {} : { options: request.options }), ...(request.overrides === undefined ? {} : { overrides: request.overrides }), ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }) });
  if (request.spec !== undefined) return { registered: (await flows.register(request.spec)).registered, carried: carried(request.inputs ?? {}) };
  if (request.pipeline !== undefined) return { registered: (await flows.registerPipeline(request.pipeline)).registered, carried: carried(request.inputs ?? {}) };
  if (request.name !== undefined) {
    const found = await flows.find(request.name, request.specHash);
    if ("missing" in found) return { refusal: found.missing === "name" ? { code: "unknown_fluxnode", message: "No FluxNode has that name." } : { code: "unknown_spec_hash", message: "That FluxNode has no spec with that hash." } };
    // A name may hold a pipeline, which the contract cannot see from the request: refused here as it refuses an inline one.
    if (isRegisteredPipeline(found.found) && request.overrides !== undefined) return { refusal: { code: "invalid_request", message: FLUXNODE_PIPELINE_OVERRIDES_MESSAGE, issues: [{ path: "/overrides", code: "run_request.overrides_on_pipeline", message: FLUXNODE_PIPELINE_OVERRIDES_MESSAGE }] } };
    return { registered: found.found, carried: carried(request.inputs ?? {}) };
  }
  const held = request.resumeHandle === undefined ? undefined : runs.resumable(request.resumeHandle);
  if (!held) return { refusal: { code: "unknown_run", message: "That resume handle names no run this engine can continue." } };
  // The same inputs, key, options and overrides; a correlation id given now ties this run in, else the first one's.
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
async function finish(context: FluxNodeRunContext, pipelines: FluxNodePipelineContext, runs: FluxNodeRunRegistry, run: FluxNodeRun, registered: FluxNodeRegistered, settled: () => Promise<void>): Promise<FluxNodeRunResult> {
  const resumeHandle = runs.resumeHandleOf(run.runId);
  try {
    const outcome = isRegisteredPipeline(registered) ? await runFluxNodePipeline(pipelines, run, registered, resumeHandle) : await runFluxNode(context, run, registered, resumeHandle, settled);
    if (outcome.learned) runs.learned(registered.flowId, outcome.learned);
    if (outcome.judgeDigest !== undefined && outcome.result.status === "achieved" && outcome.result.verdict.by === "judge") runs.judged(registered.flowId, outcome.judgeDigest);
    return outcome.result;
  } catch (error) {
    run.tell({ type: "step", flowId: registered.flowId, stepId: "fluxnode.run", label: `Core could not run this FluxNode (${error instanceof Error ? error.name : "unknown error"}).`, state: "failed" });
    const endedAt = context.now();
    return isRegisteredPipeline(registered)
      ? fluxNodePipelineResult({ run, registered, status: "stopped", path: "replayed", cost: { calls: 0, tokens: 0, usd: 0 }, resumeHandle, endedAt })
      : await fluxNodeResultOf({ run, spec: registered.spec, inputs: run.carried.inputs, answered: undefined, bridge: undefined, owner: context.service, resumeHandle, endedAt });
  }
}

/** The default webhook POST: the runtime's own `fetch`. */
const postWithGlobalFetch: PipelineFetch = async (url, init) => await fetch(url, { method: init.method, headers: init.headers, body: init.body, ...(init.signal === undefined ? {} : { signal: init.signal }) });

async function settledWithin(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work.then(() => undefined, () => undefined), new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); })]);
  if (timer !== undefined) clearTimeout(timer);
}
