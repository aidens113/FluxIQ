// Every place a pinned call is written goes through one door: a graph's save. So that door
// refuses a pin that could not run, and keeps `part_calls` true of what the graph now holds,
// whether a build applied the graph, a person edited it in the panel, or a repair replaced it.
//
// A Flow's own Subflow calls are not read here. Only a Flow's save can tell which saved part a
// sibling is (`./save-applied-flow.ts`); here a pin is all a graph says about the library.
//
// The Flow's row is written after the graph, so a graph that failed to save leaves no caller.
// A database that cannot be written propagates, as the library's other writes do.
import { AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID } from "../../../../components/automation/control-flow/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../../flows/authoring/model/index.ts";
import { AutomationStudioProjectPartStore, AutomationStudioProjectStoreUnavailableError, type AutomationStudioProjectDatabasePool } from "../../../persistence/automation/index.ts";
import { projectPartCallBound } from "./call-bounds.ts";
import { projectPartPinnedCalls } from "./call-order.ts";

type SavedGraph = Pick<AutomationStudioFlowArtifact, "flowId" | "nodes" | "metadata">;

const WORDS: Readonly<Record<string, string>> = {
  "part.unresolved_call": "a step pins a saved part or version that is not in this project's library",
  "part.call_cycle": "a step pins a saved part whose calls go round in a circle",
  "part.call_too_deep": "a step pins a saved part whose calls go too many levels deep"
};

export type AutomationStudioSavedFlowGraph = {
  /** Throws, with the stable code first in its message, when a pin of this graph could not run. */
  refuseUnrunnable(projectId: string, flow: SavedGraph): Promise<void>;
  /** What this graph pins now, known to the library. */
  record(projectId: string, flow: SavedGraph): Promise<void>;
};

export function automationStudioKeepPartCallsOf(pool: AutomationStudioProjectDatabasePool | undefined): AutomationStudioSavedFlowGraph {
  const withStore = async (projectId: string, use: (store: AutomationStudioProjectPartStore) => Promise<void>): Promise<void> => {
    if (!pool) return;
    let store: AutomationStudioProjectPartStore;
    try {
      store = await AutomationStudioProjectPartStore.open({ pool, projectId });
    } catch (error) {
      if (AutomationStudioProjectStoreUnavailableError.is(error)) return;
      throw error;
    }
    try {
      await use(store);
    } finally {
      await store.close();
    }
  };
  return {
    refuseUnrunnable: async (projectId, flow) => {
      const pins = projectPartPinnedCalls(flow).map((call) => call.pin);
      if (!pins.length) return;
      await withStore(projectId, async (store) => {
        const bound = await projectPartCallBound(store, {}, pins);
        if (bound) throw new Error(`${bound}: this graph was not saved because ${WORDS[bound]}.`);
      });
    },
    record: async (projectId, flow) => {
      // A graph with no call step may have had one, so its rows are looked at too.
      const parent = flow.metadata?.parentFlowId;
      await withStore(projectId, (store) => store.syncFlowGraphPins({
        flowId: typeof parent === "string" && parent ? parent : flow.flowId,
        graphFlowId: flow.flowId,
        callNodeIds: flow.nodes.filter((node) => node.definitionId === AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID).map((node) => node.id),
        pins: projectPartPinnedCalls(flow).map((call) => ({ nodeId: call.nodeId, partId: call.pin.partId, version: call.pin.version }))
      }));
    }
  };
}

/** `writer` with its one graph save going through `calls` (header). */
export function automationStudioFlowWriterKeepingPartCalls<Writer extends { saveFlowInternal(input: { projectId: string; flow: AutomationStudioFlowArtifact }, ...rest: never[]): Promise<AutomationStudioFlowArtifact> }>(writer: Writer, calls: AutomationStudioSavedFlowGraph): Writer {
  const save = writer.saveFlowInternal.bind(writer);
  writer.saveFlowInternal = (async (input: { projectId: string; flow: AutomationStudioFlowArtifact }, ...rest: never[]) => {
    await calls.refuseUnrunnable(input.projectId, input.flow);
    const saved = await save(input, ...rest);
    await calls.record(input.projectId, saved);
    return saved;
  }) as Writer["saveFlowInternal"];
  return writer;
}
