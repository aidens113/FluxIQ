// @fluxiq-test-group real-sql
// A part kept in the library and pinned from two Flows: the version a caller pins stays what it
// runs, a call that could not finish is refused at the save and at the run, and a person can see who calls.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GetProjectPartResponse, ListProjectPartsResponse, RunProjectPartResponse } from "../../../../../api-contracts/automation.ts";
import { automationStudioPinnedSubflowId } from "../../../../../engine/automation/frames/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowSubflow } from "../../../../../flows/authoring/model/index.ts";
import { AutomationStudioProjectPartStore } from "../../../../persistence/automation/index.ts";
import { automationStudioFlowWriterKeepingPartCalls, saveProjectPartsOfAppliedFlow, type AutomationStudioProjectPartRunRefusal } from "../index.ts";
import { actionGraph, openRowsHarness, PROJECT, siteGraph, type RowsHarness } from "../run/tests/part-rows-harness.ts";

const ASKED = { permittedConsequences: ["create_new"], acknowledgedRepeat: true };

describe("pinned calls to a saved part", () => {
  let harness: RowsHarness;
  beforeEach(async () => {
    harness = await openRowsHarness();
  });
  afterEach(async () => {
    await harness.close();
  });

  const withStore = async <T>(use: (store: AutomationStudioProjectPartStore) => Promise<T>): Promise<T> => {
    const store = await AutomationStudioProjectPartStore.open({ pool: harness.pool, projectId: PROJECT });
    try {
      return await use(store);
    } finally {
      await store.close();
    }
  };
  /** A version with only what the bounds read: its calls. */
  const writeBare = async (partId: string, calls: { partId: string; version: number }[], version = 1) => await withStore(async (store) => {
    const shapeHash = createHash("sha256").update(`${partId}.${version}`).digest("hex");
    return await store.writeVersion({
    partId, sourceFlowId: "flow.bare", sourceSubflowId: `subflow.${partId}`,
    card: { partId, version, name: "A bare part", purpose: "A bare part", sites: ["https://list.example"], inputs: [], outputs: [], fixedValues: [], lastingClasses: [], calls, shapeHash },
    searchable: { name: partId, purpose: partId, ports: [] }, shapeHash,
    facets: { site: [], input: [], output: [], lasting: [] },
    snapshot: { schemaVersion: "automation-studio.project-part.v1", graph: { interface: { inputs: [], outputs: [] }, nodes: [{ id: `${partId}.start`, definitionId: "builtin.control.start" }, ...calls.map((call, index) => ({ id: `${partId}.call.${index}`, definitionId: "builtin.control.call-subflow", parameterValues: { part: call } }))], edges: [] }, start: { conditions: [], source: "none" }, end: { conditions: [] } },
    sourceGraphFlowId: `graph.${partId}`, sourceGraphRevision: 1,
    calls: calls.map((call, index) => ({ nodeId: `${partId}.call.${index}`, partId: call.partId, version: call.version }))
    });
  });
  const subflowNamed = (key: string, flowId = "flow.source", role = "utility") => ({ schemaVersion: "0.1", subflowId: `subflow.${key}`, flowId, projectId: PROJECT, name: `Part ${key}`, description: `Part ${key}`, role, graphFlowId: `graph.${key}`, createdAt: 1, updatedAt: 1, status: "active" }) as unknown as AutomationStudioFlowSubflow;
  const saving = async (subflow: AutomationStudioFlowSubflow, graphFlow: AutomationStudioFlowArtifact, flowId = "flow.source") => await saveProjectPartsOfAppliedFlow({ pool: harness.pool, projectId: PROJECT, flowId, requestWords: "do what a person asked", startLocation: "https://list.example/start", subflows: [{ subflow, graphFlow }] });
  type SavingWriter = { saveFlowInternal(input: { projectId: string; flow: AutomationStudioFlowArtifact }): Promise<AutomationStudioFlowArtifact> };
  const writerSaving = (saved: unknown[]): SavingWriter => {
    const plain: SavingWriter = {
      saveFlowInternal: async (input) => {
        saved.push(input.flow);
        return input.flow;
      }
    };
    return automationStudioFlowWriterKeepingPartCalls(plain, harness.parts.flowGraphCalls());
  };
  const savedIds = async () => {
    await harness.save([actionGraph("act"), siteGraph("site", { subflowId: "subflow.act" })]);
    const { parts } = await harness.parts.list({ projectId: PROJECT }) as ListProjectPartsResponse;
    return { act: parts.find((card) => card.name === "Part act")!.partId, site: parts.find((card) => card.name === "Part site")!.partId };
  };
  const callerGraph = (name: string, flowId: string, pin: { partId: string; version: number }): AutomationStudioFlowArtifact => {
    const graph = siteGraph(name, { part: pin });
    return { ...graph, flowId: `${flowId}.graph`, metadata: { parentFlowId: flowId, parentSubflowId: `subflow.${name}`, subflowGraph: true } };
  };

  it("a run's library reads a version with its calls as the pins they stand for, and a new version of what it calls changes nothing it reads", async () => {
    const { act, site } = await savedIds();
    const read = async () => {
      const graphs = harness.parts.graphs(PROJECT, "flow.caller");
      return JSON.stringify((await graphs.load({ partId: site, version: 1 }))!.graph);
    };
    const before = await read();
    const call = JSON.parse(before).nodes.find((node: { id: string }) => node.id === "site.call");
    expect(call.parameterValues.part).toEqual({ partId: act, version: 1 });
    expect(call.parameterValues.subflowId, "a sibling's id means nothing outside its Flow").toBeUndefined();
    const callsBefore = await withStore((store) => store.listCallsFrom({ partId: site, version: 1 }));
    const changed = actionGraph("act");
    changed.nodes[1] = { ...changed.nodes[1]!, parameterValues: { target: { selector: "#another" } } };
    await harness.save([changed]);
    expect(await withStore(async (store) => (await store.listVersions(act)).map((version) => version.version)), "the part has a newer version").toEqual([2, 1]);
    expect(await read(), "the pinned caller is byte-identical").toBe(before);
    expect(await withStore((store) => store.listCallsFrom({ partId: site, version: 1 })), "and so is what it pins").toEqual(callsBefore);
    const answer = await harness.parts.run({ projectId: PROJECT, partId: site, inputs: {}, ...ASKED }) as RunProjectPartResponse;
    expect(answer.status).toBe("succeeded");
    expect(harness.domain.pressed, "the old version still runs: its control, not the new one").toEqual(["a", "b", "c"]);
  });

  it("a version not in the library fails the call and refuses the part, with nothing done", async () => {
    await savedIds();
    const graphs = harness.parts.graphs(PROJECT, "flow.caller");
    expect(await graphs.load({ partId: "part.nobody", version: 1 })).toBeUndefined();
    expect(await graphs.refusal({ partId: "part.nobody", version: 1 })).toBeUndefined();
  });

  describe("a call that could not finish", () => {
    it("a cycle is refused at the run, before anything is read of the page", async () => {
      await writeBare("part.one", [{ partId: "part.two", version: 1 }]);
      await writeBare("part.two", [{ partId: "part.one", version: 1 }]);
      const answer = await harness.parts.run({ projectId: PROJECT, partId: "part.one", inputs: {} }) as AutomationStudioProjectPartRunRefusal;
      expect(answer).toMatchObject({ ok: false, code: "part.call_cycle" });
      expect(harness.domain.asked).toEqual([]);
      expect(await harness.parts.graphs(PROJECT, "flow.caller").refusal({ partId: "part.one", version: 1 })).toMatchObject({ code: "part.call_cycle" });
    });

    it("a cycle is refused at the save: a new version that would reach its own part is not written", async () => {
      const { act, site } = await savedIds();
      const flowPart = actionGraph("act");
      flowPart.nodes.push({ id: "act.back", definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", label: "Back", parameterValues: { part: { partId: site, version: 1 } }, metadata: {} });
      flowPart.edges.push({ id: "act.2", sourceNodeId: "act.press", sourcePortId: "success", targetNodeId: "act.back", targetPortId: "in" });
      const result = await saving(subflowNamed("act"), flowPart);
      expect(result.skipped).toEqual([{ subflowId: "subflow.act", reason: "part.call_cycle" }]);
      expect(await withStore(async (store) => (await store.getPart(act))?.latestVersion)).toBe(1);
    });

    it("depth is refused at the run, one past the bound, and a chain at the bound runs its reads", async () => {
      for (let level = 9; level >= 1; level -= 1) await writeBare(`part.level${level}`, level === 9 ? [] : [{ partId: `part.level${level + 1}`, version: 1 }]);
      const answer = await harness.parts.run({ projectId: PROJECT, partId: "part.level1", inputs: {} }) as AutomationStudioProjectPartRunRefusal;
      expect(answer).toMatchObject({ ok: false, code: "part.call_too_deep" });
      expect(await harness.parts.graphs(PROJECT, "flow.caller").refusal({ partId: "part.level1", version: 1 })).toMatchObject({ code: "part.call_too_deep" });
      expect(await harness.parts.graphs(PROJECT, "flow.caller").refusal({ partId: "part.level2", version: 1 }), "eight deep is within the bound").toBeUndefined();
    });

    it("depth is refused at the save", async () => {
      for (let level = 8; level >= 1; level -= 1) await writeBare(`part.level${level}`, level === 8 ? [] : [{ partId: `part.level${level + 1}`, version: 1 }]);
      const result = await saving(subflowNamed("top"), siteGraph("top", { part: { partId: "part.level1", version: 1 } }));
      expect(result.skipped).toEqual([{ subflowId: "subflow.top", reason: "part.call_too_deep" }]);
      const fine = await saving(subflowNamed("top"), siteGraph("top", { part: { partId: "part.level2", version: 1 } }));
      expect(fine.saved).toHaveLength(1);
    });

    it("a pin to a version that is not there is not saved as a part", async () => {
      const result = await saving(subflowNamed("top"), siteGraph("top", { part: { partId: "part.nobody", version: 1 } }));
      expect(result.skipped).toEqual([{ subflowId: "subflow.top", reason: "part.unresolved_call" }]);
    });
  });

  describe("who calls a part", () => {
    it("a person sees the Flow they would open, for every place a pin is written, and finds parts by it", async () => {
      const { act, site } = await savedIds();
      const pin = { partId: site, version: 1 };
      // A Flow's own save, and a graph written directly: the two doors a pin comes through.
      await saving(subflowNamed("main", "flow.one", "primary"), callerGraph("main", "flow.one", pin), "flow.one");
      const saved: unknown[] = [];
      await writerSaving(saved).saveFlowInternal({ projectId: PROJECT, flow: callerGraph("main", "flow.two", pin) });
      expect(saved).toHaveLength(1);
      const got = await harness.parts.get({ projectId: PROJECT, partId: site }) as GetProjectPartResponse;
      const flows = got.callers.filter((caller) => caller.kind === "flow").map((caller) => caller.kind === "flow" ? [caller.flowId, caller.version] : []);
      expect(flows.map(([flowId]) => flowId).sort()).toEqual(["flow.one", "flow.two"]);
      expect(flows.every(([, version]) => version === 1)).toBe(true);
      expect((await harness.parts.get({ projectId: PROJECT, partId: act }) as GetProjectPartResponse).callers, "the action's caller is the site's version").toEqual([{ kind: "part", partId: site, callerVersion: 1, nodeId: "site.call", version: 1 }]);
      for (const flowId of ["flow.one", "flow.two"]) {
        expect((await harness.parts.list({ projectId: PROJECT, usedByFlowId: flowId }) as ListProjectPartsResponse).parts.map((card) => card.partId)).toEqual([site]);
      }
      expect((await harness.parts.list({ projectId: PROJECT, usedByFlowId: "flow.one.graph" }) as ListProjectPartsResponse).parts).toEqual([]);
    });

    it("a graph saved without its pin stops being a caller, and a part is called no more", async () => {
      const { site } = await savedIds();
      const calls = harness.parts.flowGraphCalls();
      const graph = callerGraph("main", "flow.one", { partId: site, version: 1 });
      await calls.record(PROJECT, graph);
      const callerCount = async () => (await harness.parts.get({ projectId: PROJECT, partId: site }) as GetProjectPartResponse).callers.length;
      expect(await callerCount()).toBe(1);
      await calls.record(PROJECT, { ...graph, nodes: graph.nodes.filter((node) => node.id !== "main.call") });
      expect(await callerCount()).toBe(0);
    });

    it("a graph whose pin could not run is refused at its save, with its stable code first, and nothing is written", async () => {
      const saved: unknown[] = [];
      const writer = writerSaving(saved);
      await expect(writer.saveFlowInternal({ projectId: PROJECT, flow: callerGraph("main", "flow.one", { partId: "part.nobody", version: 4 }) })).rejects.toThrow(/^part\.unresolved_call: /u);
      expect(saved).toEqual([]);
      await writeBare("part.one", [{ partId: "part.two", version: 1 }]);
      await writeBare("part.two", [{ partId: "part.one", version: 1 }]);
      await expect(writer.saveFlowInternal({ projectId: PROJECT, flow: callerGraph("main", "flow.one", { partId: "part.one", version: 1 }) })).rejects.toThrow(/^part\.call_cycle: /u);
      expect(saved).toEqual([]);
    });
  });

  it("the id a pinned frame runs under names the part and the version", () => {
    expect(automationStudioPinnedSubflowId({ partId: "part.abc", version: 4 })).toBe("part:part.abc:v4");
  });
});
