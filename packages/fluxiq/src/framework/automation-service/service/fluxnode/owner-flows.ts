// Where FluxNodes live in Core (fluxnode-plan N1, O2): one owner project, made on first use, and one
// Flow per FluxNode name and spec hash, which is the task key. A new spec hash under a known name is a
// new Flow beside the old, which stays. The Flow says what it is in its own metadata (`fluxNode`: the
// name, the spec hash, its path `nodes/<name>` from `fluxNodeNameToFlowPath`, and the spec), so the
// registry is found again from the Flows after a restart and no table of folders is invented here.
//
// **The goal is the Flow's instruction:** each run saves the goal filled with its inputs, only when the
// words changed, since a saved instruction is a change to the Flow.
//
// **A pipeline is registered the same way** (`registerPipeline`): its compiled Flow is filed by the pipeline's
// name, under its `dataPipelineHash`, in the same registry, so it runs by name as a FluxNode does.
//
// Registering is serial, so two registrations of one new spec make one Flow.

import { dataPipelineHash, fluxNodeNameToFlowPath, fluxNodeSpecHash, parseDataPipeline, parseFluxNodeSpec, type DataPipeline, type FluxNodeSpec } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioService } from "../../service.ts";
import { compilePipeline } from "../pipelines/index.ts";
import type { FluxNodeRegistered, FluxNodeRegisteredPipeline } from "./pipeline/index.ts";

/** The owner project's name, and the words that mark it as FluxIQ's own. */
const PROJECT_NAME = "FluxNodes";
const PROJECT_MARK = "FluxNodes declared in code: one Flow per FluxNode name and spec.";
const INSTRUCTION_PREFIX = "instruction.fluxnode.";
const METADATA_KEY = "fluxNode";

/** A FluxNode at one spec, and its Flow. */
export type FluxNodeRegisteredSpec = {
  name: string;
  specHash: string;
  spec: FluxNodeSpec;
  projectId: string;
  flowId: string;
  flowPath: string;
  registeredAt: number;
};

type Named = { latest: string; specs: Map<string, FluxNodeRegistered> };

export class FluxNodeOwnerFlows {
  private readonly byName = new Map<string, Named>();
  private owner: Promise<string> | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly service: AutomationStudioService, private readonly domainId: string | null | undefined, private readonly now: () => number) {}

  /** Registers `spec`: the same name and hash answer what is there; a new one makes its Flow. */
  async register(spec: FluxNodeSpec): Promise<{ registered: FluxNodeRegisteredSpec; created: boolean; previousSpecHash?: string }> {
    return await this.registerNamed(spec.name, async () => await fluxNodeSpecHash(spec), async (specHash) => await this.flowFor(spec, specHash));
  }

  /** Registers `pipeline` as `register` does a spec: its hash is `dataPipelineHash`, and its Flow is the compiled pipeline. */
  async registerPipeline(pipeline: DataPipeline): Promise<{ registered: FluxNodeRegisteredPipeline; created: boolean; previousSpecHash?: string }> {
    return await this.registerNamed(pipeline.name, async () => await dataPipelineHash(pipeline), async (specHash) => await this.pipelineFlowFor(pipeline, specHash));
  }

  /** A registered FluxNode at `specHash`, or at its latest. */
  async find(name: string, specHash?: string): Promise<{ found: FluxNodeRegistered } | { missing: "name" | "hash" }> {
    await this.serially(async () => await this.projectId());
    const named = this.byName.get(name);
    if (!named) return { missing: "name" };
    const found = named.specs.get(specHash ?? named.latest);
    return found ? { found } : { missing: "hash" };
  }

  /** Saves `goal` as the Flow's instruction when its words changed. */
  async instruct(registered: FluxNodeRegisteredSpec, goal: string): Promise<void> {
    // One instruction per Flow: the project holds every FluxNode's Flow, and an instruction's id is the project's.
    const instructionId = `${INSTRUCTION_PREFIX}${registered.flowId}`;
    const held = await this.service.getFlowInstruction(registered.projectId, instructionId);
    if (held?.body === goal) return;
    const at = this.now();
    await this.service.saveFlowInstruction(registered.projectId, {
      schemaVersion: "0.1", instructionId, title: "The FluxNode's goal", body: goal,
      scope: { kind: "flow", projectId: registered.projectId, flowId: registered.flowId }, priority: 100, status: "active", requirement: "required", tags: ["generation"],
      createdAt: held?.createdAt ?? at, updatedAt: at
    });
  }

  /**
   * The registry step both kinds share. `T` is the kind the caller registers: a name and hash held already
   * are of that kind, because a spec's hash and a pipeline's cannot be the same value.
   */
  private async registerNamed<T extends FluxNodeRegistered>(name: string, hashOf: () => Promise<string>, make: (specHash: string) => Promise<T>): Promise<{ registered: T; created: boolean; previousSpecHash?: string }> {
    return await this.serially(async () => {
      await this.projectId();
      const specHash = await hashOf();
      const named = this.byName.get(name);
      const held = named?.specs.get(specHash);
      if (held) return { registered: held as T, created: false };
      const registered = await make(specHash);
      const previous = named?.latest;
      if (named) {
        named.specs.set(specHash, registered);
        named.latest = specHash;
      } else this.byName.set(name, { latest: specHash, specs: new Map([[specHash, registered]]) });
      return { registered, created: true, ...(previous !== undefined && previous !== specHash ? { previousSpecHash: previous } : {}) };
    });
  }

  private async serially<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.then(() => undefined, () => undefined);
    return await next;
  }

  /** The owner project's id: found by its name and mark, else made, and its Flows read back once. */
  private async projectId(): Promise<string> {
    this.owner ??= (async () => {
      const { projects } = await this.service.listProjects();
      const found = projects.find((project) => project.name === PROJECT_NAME && project.description === PROJECT_MARK && (this.domainId == null || project.domainId === this.domainId));
      const project = found ?? await this.service.createProject({ name: PROJECT_NAME, description: PROJECT_MARK, ...(this.domainId ? { domainId: this.domainId } : {}) });
      if (found) await this.readBack(project.id);
      return project.id;
    })();
    try {
      return await this.owner;
    } catch (error) {
      this.owner = undefined;
      throw error;
    }
  }

  /** What the Flows of an existing owner project say they are. A Flow whose spec no longer parses is left out. */
  private async readBack(projectId: string): Promise<void> {
    const entries = await this.service.listFlows(projectId);
    const known = entries.map((entry) => ({ flow: entry.flow, held: entry.flow.metadata?.[METADATA_KEY] })).sort((one, other) => one.flow.createdAt - other.flow.createdAt);
    for (const { flow, held } of known) {
      if (typeof held !== "object" || held === null || Array.isArray(held) || typeof held.specHash !== "string") continue;
      const registered = this.registeredFrom(projectId, flow.flowId, flow.createdAt, held.specHash, held);
      if (!registered) continue;
      const named = this.byName.get(registered.name);
      if (named) {
        named.specs.set(registered.specHash, registered);
        named.latest = registered.specHash;
      } else this.byName.set(registered.name, { latest: registered.specHash, specs: new Map([[registered.specHash, registered]]) });
    }
  }

  /** What a Flow's `fluxNode` metadata says it is: a FluxNode at its spec, or a pipeline; nothing when neither still parses. */
  private registeredFrom(projectId: string, flowId: string, createdAt: number, specHash: string, held: JsonObject): FluxNodeRegistered | undefined {
    if (held.pipeline !== undefined) {
      const pipeline = parseDataPipeline(held.pipeline);
      return pipeline.ok ? { name: pipeline.value.name, specHash, pipeline: pipeline.value, projectId, flowId, flowPath: fluxNodeNameToFlowPath(pipeline.value.name), registeredAt: createdAt } : undefined;
    }
    const parsed = parseFluxNodeSpec(held.spec);
    return parsed.ok ? { name: parsed.value.name, specHash, spec: parsed.value, projectId, flowId, flowPath: fluxNodeNameToFlowPath(parsed.value.name), registeredAt: createdAt } : undefined;
  }

  /** A new Flow for the pipeline: its compiled graph, saying in its metadata what it is. */
  private async pipelineFlowFor(pipeline: DataPipeline, specHash: string): Promise<FluxNodeRegisteredPipeline> {
    const projectId = await this.projectId();
    const flowPath = fluxNodeNameToFlowPath(pipeline.name);
    const made = await this.service.createFlow({ projectId, name: pipeline.name, description: `Data pipeline ${pipeline.name} (hash ${specHash.slice(0, 12)})` });
    const compiled = compilePipeline(pipeline);
    const said: JsonObject = { name: pipeline.name, specHash, flowPath, pipeline: JSON.parse(JSON.stringify(pipeline)) as JsonValue };
    const saved = await this.service.saveFlow({
      projectId,
      // A top-level Flow cannot own nodes or edges yet (the Flow writer, until Flow unification lands), so the
      // compiled graph is kept in the metadata, which is what the pipeline run reads.
      flow: { ...made, metadata: { ...(made.metadata ?? {}), ...compiled.metadata, pipelineGraph: JSON.parse(JSON.stringify({ nodes: compiled.nodes, edges: compiled.edges })) as JsonValue, [METADATA_KEY]: said } }
    });
    return { name: pipeline.name, specHash, pipeline, projectId, flowId: saved.flowId, flowPath, registeredAt: this.now() };
  }

  /** A new Flow for the spec, saying what it is. */
  private async flowFor(spec: FluxNodeSpec, specHash: string): Promise<FluxNodeRegisteredSpec> {
    const projectId = await this.projectId();
    const flowPath = fluxNodeNameToFlowPath(spec.name);
    const made = await this.service.createFlow({ projectId, name: spec.name, description: `FluxNode ${spec.name} (spec ${specHash.slice(0, 12)})` });
    const said: JsonObject = { name: spec.name, specHash, flowPath, spec: JSON.parse(JSON.stringify(spec)) as JsonValue };
    const saved = await this.service.saveFlow({ projectId, flow: { ...made, metadata: { ...(made.metadata ?? {}), [METADATA_KEY]: said } } });
    return { name: spec.name, specHash, spec, projectId, flowId: saved.flowId, flowPath, registeredAt: this.now() };
  }
}
