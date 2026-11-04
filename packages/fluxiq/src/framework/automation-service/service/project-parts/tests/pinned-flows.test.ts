// @fluxiq-test-group real-sql
// A site part and its action part pinned from two Flows, through the real service: a person's
// save, the Router, the run session's source, the executor and frames. Only the domain's two
// nodes are made of plain functions. Asserted: what reached the domain, and what a person reads back.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GetProjectPartResponse, ListProjectPartsResponse } from "../../../../../api-contracts/automation.ts";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../../../runtime/native-nodes/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { AutomationStudioService } from "../../../service.ts";

vi.setConfig({ testTimeout: 120_000 });

const READ_ID = "domain.example.read";
const PRESS_ID = "domain.example.press";
const row = { $state: { path: "item" } };

const node = (id: string, label: string): AutomationStudioNodeDefinition => ({
  schemaVersion: "0.1", id, version: "1.0.0", label, description: label, category: "action",
  source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: id },
  availability: { kind: "domain", domainId: "example" }, requiredRuntimeCapabilities: ["example.actions"], capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any", required: false }, { id: "item", label: "Row", valueType: "any", required: false }],
  outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "rows", label: "Rows", valueType: "any" }],
  parameters: [{ id: "target", label: "Target", valueType: "object", required: false }, { id: "words", label: "Words", valueType: "string", required: false }, { id: "url", label: "Address", valueType: "string", required: false }],
  safety: { requiredPermissions: [] }
});

const edge = (id: string, sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in"): AutomationStudioFlowEdge => ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId });
const start = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.control.start", definitionVersion: "1.0.0", label: "Start" });
const call = (id: string, parameterValues: JsonObject): AutomationStudioFlowNode => ({ id, definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", label: "Call", parameterValues });
const press = (id: string, control = "#keep"): AutomationStudioFlowNode => ({ id, definitionId: PRESS_ID, definitionVersion: "1.0.0", label: "Press", parameterValues: { target: { selector: control } }, metadata: { declaredConsequences: ["create_new"] } });

describe("a part and what it calls, pinned from two Flows", () => {
  let dataDir = "";
  let service: AutomationStudioService;
  let pressed: string[];
  let controls: string[];
  let rows: JsonObject[];
  let projectId = "";
  let modelCalls = 0;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-pinned-flows-"));
    pressed = [];
    controls = [];
    rows = [{ key: "a" }, { key: "b" }, { key: "c" }];
    modelCalls = 0;
    const native = new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register({
      schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [node(READ_ID, "Read"), node(PRESS_ID, "Press")]
    }, {
      packageId: "example.package", packageVersion: "1.0.0",
      implementations: {
        [READ_ID]: () => ({ status: "success", route: "success", outputs: { rows: rows.map((one) => ({ ...one })) } }),
        [PRESS_ID]: (context) => {
          pressed.push(String((context.inputs?.item as JsonObject | undefined)?.key ?? "none"));
          controls.push(String((context.parameters.target as JsonObject | undefined)?.selector));
          return { status: "success", route: "success", outputs: { success: true } };
        }
      }
    });
    service = new AutomationStudioService({
      dataDir,
      llmProviderResolver: () => {
        modelCalls += 1;
        throw new Error("no model is called by a pinned part's run");
      }
    });
    service.bindNativeNodeRuntime(native);
    projectId = (await service.createProject({ name: "Pinned flows", domainId: "example" })).id;
  });
  afterEach(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  const subflowOf = async (flowId: string, name: string, role: "primary" | "utility", graph: { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[]; interface?: { inputs: JsonValue[]; outputs: JsonValue[] } }) => {
    const subflow = await service.createFlowSubflow({ projectId, flowId, name, role });
    const made = await service.getFlow(projectId, subflow.graphFlowId!);
    await service.saveFlow({ projectId, flow: { ...made, nodes: graph.nodes, edges: graph.edges, ...(graph.interface ? { interface: graph.interface as unknown as typeof made.interface } : {}) } });
    return subflow;
  };

  /** The source Flow: a site part that reads and calls an action part per row, handing it the row. Kept by a person's "save this". */
  const savedParts = async () => {
    const source = await service.createFlow({ projectId, flowId: "flow.source", name: "Source" });
    const action = await subflowOf(source.flowId, "Keep this row", "utility", {
      nodes: [start("act.start"), press("act.press")],
      edges: [edge("act.1", "act.start", "success", "act.press")],
      interface: { inputs: [{ id: "item", name: "The row", valueType: { kind: "unknown" }, required: true }], outputs: [] }
    });
    const site = await subflowOf(source.flowId, "Read the rows and keep them", "utility", {
      nodes: [
        start("site.start"),
        { id: "site.read", definitionId: READ_ID, definitionVersion: "1.0.0", label: "Read", parameterValues: {}, metadata: { declaredConsequences: [] } },
        { id: "site.each", definitionId: "builtin.control.for-each", definitionVersion: "1.0.0", label: "Each" },
        call("site.call", { subflowId: action.subflowId, inputs: { item: row } }),
        { id: "site.end", definitionId: "builtin.control.end", definitionVersion: "1.0.0", label: "End" }
      ],
      edges: [
        edge("site.1", "site.start", "success", "site.read"), edge("site.2", "site.read", "success", "site.each"), edge("site.3", "site.read", "rows", "site.each", "items"),
        edge("site.4", "site.each", "body", "site.call"), edge("site.5", "site.call", "success", "site.each"), edge("site.6", "site.each", "done", "site.end")
      ]
    });
    const kept = await service.projectParts.save({ projectId, flowId: source.flowId, subflowId: site.subflowId, name: "Read the rows and keep them", purpose: "Keep every row the list shows" });
    if (!("saved" in kept) || !kept.saved) throw new Error(JSON.stringify(kept));
    const cards = (await service.projectParts.list({ projectId }) as ListProjectPartsResponse).parts;
    const actionPart = cards.find((card) => card.partId !== kept.partId)!;
    return { source, action, partId: kept.partId, version: kept.version, actionPartId: actionPart.partId };
  };

  const pinningFlow = async (flowId: string, pin: { partId: string; version: number }) => {
    const flow = await service.createFlow({ projectId, flowId, name: flowId });
    await service.saveFlowGenerationInstruction({ projectId, flowId, instruction: "Keep every row." });
    const main = await subflowOf(flow.flowId, "Main", "primary", { nodes: [start(`${flowId}.start`), call(`${flowId}.call`, { part: pin, inputs: {} })], edges: [edge(`${flowId}.1`, `${flowId}.start`, "success", `${flowId}.call`)] });
    await service.setFlowMapFallback({ projectId, flowId: flow.flowId, kind: "subflow", targetSubflowId: main.subflowId });
    return { flow, main };
  };
  const run = async (flowId: string) => await service.runRuntimeSession({ projectId, flowId, inputs: {}, adaptiveMode: "no_llm_intervention", authorizedDomainIds: ["example"], permittedConsequences: ["create_new"], authorizedExternalSideEffects: true });
  const targetsOf = (session: Awaited<ReturnType<typeof run>>): string[] => {
    const found: string[] = [];
    const visit = (attempts: NonNullable<typeof session.trace>["attempts"]) => {
      for (const attempt of attempts) {
        if (attempt.subflowTarget) found.push(attempt.subflowTarget.subflowId);
        if (attempt.childTrace) visit(attempt.childTrace.attempts);
      }
    };
    visit(session.trace?.attempts ?? []);
    return found;
  };

  it("both Flows run the versions they pin, at no model call, press each row once scoped to it, and say which versions ran", async () => {
    const { partId, version, actionPartId } = await savedParts();
    await pinningFlow("flow.one", { partId, version });
    await pinningFlow("flow.two", { partId, version });
    for (const flowId of ["flow.one", "flow.two"]) {
      pressed.length = 0;
      const session = await run(flowId);
      expect(session.status, JSON.stringify(session.trace?.message ?? session.trace?.failure ?? null)).toBe("succeeded");
      expect(pressed).toEqual(["a", "b", "c"]);
      const targets = targetsOf(session);
      expect(new Set(targets)).toEqual(new Set([`part:${partId}:v${version}`, `part:${actionPartId}:v1`]));
      expect(targets.filter((target) => target === `part:${actionPartId}:v1`), "one call per row").toHaveLength(3);
    }
    expect(modelCalls).toBe(0);
  });

  it("a part a person keeps alone says the site of the Flow it came from, though only another of its graphs opens that site", async () => {
    const { source, partId } = await savedParts();
    expect((await service.projectParts.get({ projectId, partId }) as GetProjectPartResponse).card.sites, "no graph of this Flow opens a site yet").toEqual([]);
    await subflowOf(source.flowId, "Open the site", "utility", { nodes: [start("open.start"), { id: "open.go", definitionId: READ_ID, definitionVersion: "1.0.0", label: "Open", parameterValues: { url: "https://list.example/start" }, metadata: { declaredConsequences: [] } }], edges: [edge("open.1", "open.start", "success", "open.go")] });
    const again = await subflowOf(source.flowId, "Keep a row elsewhere", "utility", { nodes: [start("other.start"), press("other.press", "#other")], edges: [edge("other.1", "other.start", "success", "other.press")] });
    const kept = await service.projectParts.save({ projectId, flowId: source.flowId, subflowId: again.subflowId });
    if (!("saved" in kept) || !kept.saved) throw new Error(JSON.stringify(kept));
    expect((await service.projectParts.get({ projectId, partId: kept.partId }) as GetProjectPartResponse).card.sites).toEqual(["https://list.example"]);
  });

  it("a person's get-project-part shows both Flows as callers, by the Flow they would open, and the action's caller is the site's version", async () => {
    const { partId, version, actionPartId } = await savedParts();
    await pinningFlow("flow.one", { partId, version });
    await pinningFlow("flow.two", { partId, version });
    const site = await service.projectParts.get({ projectId, partId }) as GetProjectPartResponse;
    expect(site.callers.flatMap((caller) => (caller.kind === "flow" ? [[caller.flowId, caller.version]] : []))).toEqual([["flow.one", version], ["flow.two", version]]);
    const action = await service.projectParts.get({ projectId, partId: actionPartId }) as GetProjectPartResponse;
    expect(action.callers).toEqual([{ kind: "part", partId, callerVersion: version, nodeId: "site.call", version: 1 }]);
    expect((await service.projectParts.list({ projectId, usedByFlowId: "flow.two" }) as ListProjectPartsResponse).parts.map((card) => card.partId)).toEqual([partId]);
  });

  it("a new version of the action changes nothing for a pinned caller: its graph is byte-identical, and it runs what it pinned", async () => {
    const { source, action, partId, version, actionPartId } = await savedParts();
    const { main } = await pinningFlow("flow.one", { partId, version });
    const before = JSON.stringify((await service.getFlow(projectId, main.graphFlowId!)).nodes);
    const graph = await service.getFlow(projectId, action.graphFlowId!);
    await service.saveFlow({ projectId, flow: { ...graph, nodes: [start("act.start"), press("act.press", "#another")] } });
    const kept = await service.projectParts.save({ projectId, flowId: source.flowId, subflowId: action.subflowId });
    expect(kept).toMatchObject({ saved: true, partId: actionPartId, version: 2 });
    expect(JSON.stringify((await service.getFlow(projectId, main.graphFlowId!)).nodes)).toBe(before);
    const session = await run("flow.one");
    expect(session.status).toBe("succeeded");
    expect(controls, "the pinned version's control").toEqual(["#keep", "#keep", "#keep"]);
    expect(targetsOf(session)).toContain(`part:${actionPartId}:v1`);
    expect(targetsOf(session)).not.toContain(`part:${actionPartId}:v2`);
  });

  it("a foreign unpinned graph is refused where it was before, and a pin it could not run is refused at the save", async () => {
    const { action } = await savedParts();
    const flow = await service.createFlow({ projectId, flowId: "flow.foreign", name: "Foreign" });
    await service.saveFlowGenerationInstruction({ projectId, flowId: flow.flowId, instruction: "Keep every row." });
    const main = await subflowOf(flow.flowId, "Main", "primary", { nodes: [start("f.start"), call("f.call", { subflowId: action.subflowId, inputs: {} })], edges: [edge("f.1", "f.start", "success", "f.call")] });
    await service.setFlowMapFallback({ projectId, flowId: flow.flowId, kind: "subflow", targetSubflowId: main.subflowId });
    const session = await run(flow.flowId);
    expect(session.status).toBe("failed");
    expect(session.trace?.attempts.at(-1)?.failure?.code).toBe("executor.call_subflow.unknown");
    expect(pressed).toEqual([]);
    const graph = await service.getFlow(projectId, main.graphFlowId!);
    await expect(service.saveFlow({ projectId, flow: { ...graph, nodes: [start("f.start"), call("f.call", { part: { partId: "part.nobody", version: 1 }, inputs: {} })] } })).rejects.toThrow(/^part\.unresolved_call: /u);
  });

  it("a version gone from the library, after the graph was saved, fails the call with its closed code and presses nothing", async () => {
    const { partId } = await savedParts();
    const { flow, main } = await pinningFlow("flow.one", { partId, version: 1 });
    const graph = await service.getFlow(projectId, main.graphFlowId!);
    // Written around the save's own refusal: a graph can outlive what it pinned only by a project restored from elsewhere.
    const writer = (service as unknown as { flowWriter: { saveFlowUnheld(input: unknown, publication: boolean): Promise<unknown> } }).flowWriter;
    await writer.saveFlowUnheld({ projectId, flow: { ...graph, nodes: [start(`${flow.flowId}.start`), call(`${flow.flowId}.call`, { part: { partId, version: 9 }, inputs: {} })] } }, false);
    const session = await run(flow.flowId);
    expect(session.status).toBe("failed");
    expect(session.trace?.attempts.at(-1)?.failure?.code).toBe("executor.call_subflow.part_version_missing");
    expect(pressed).toEqual([]);
  });
});
