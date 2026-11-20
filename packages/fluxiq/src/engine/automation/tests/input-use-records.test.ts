// Captured rows across a typed Call Subflow, with and without graph-entry input-use evidence.
// The parent's record summary finds captured arrays and rows by identity, so a child handed
// copies of them hands back data the parent's saved trace no longer recognises.
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "./fixture-contracts.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import { automationNodeStateBinding } from "../../../components/automation/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../index.ts";
import { automationStudioRootInvocation, type AutomationStudioSubflowGraph } from "../frames/index.ts";
import { AutomationStudioGraphInputUseSession, type AutomationStudioInputUseAuthority, type AutomationStudioInputUseChildCapture, type AutomationStudioInputUseFrameCapture } from "../input-use/index.ts";

// Obviously synthetic, as in graph-run's captured-record fixtures.
const ROW = "synthetic-extracted-row-that-must-never-be-persisted";
const EXCLUDED_NOTE = "synthetic-excluded-note-that-must-never-be-held";
const CALL = "builtin.control.call-subflow";
const extractedDataset = { $dataset: { datasetId: "products", recordCount: 2 } };
const firstRowMarker = { $datasetRow: { datasetId: "products", ordinal: 1 } };

const extractNode: AutomationStudioFlowNode = {
  id: "extract",
  definitionId: "builtin.policy.action",
  parameterValues: {
    outputId: "extract-list",
    parameters: {},
    recordOutput: {
      datasetId: "products",
      recordsPath: "items",
      writeMode: "append",
      schema: {
        schemaVersion: "0.1",
        fields: [
          { id: "name", label: "Name", valueType: "string", required: true },
          { id: "price", label: "Price", valueType: "number" },
          { id: "note", label: "Note", valueType: "string", handling: "exclude" }
        ]
      }
    }
  }
};

function extractionDispatcher(): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> {
  return (effect) => (effect.payload as { outputId?: unknown } | undefined)?.outputId === "extract-list"
    ? { status: "success", route: "success", outputs: { ok: true, result: { items: [{ name: ROW, price: 3, note: EXCLUDED_NOTE }, { name: `${ROW}-second`, note: EXCLUDED_NOTE }] } } }
    : { status: "success", route: "success", outputs: { ok: true } };
}

function graph(flowId: string, nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument {
  const edges = nodes.slice(1).map((node, index) => ({ id: `${nodes[index]!.id}.${node.id}`, sourceNodeId: nodes[index]!.id, targetNodeId: node.id, sourcePortId: "success", targetPortId: "in" }));
  return { schemaVersion: "0.1", flowId, ownerKind: "routine", ownerId: flowId, name: flowId, nodes, edges, createdAt: 1, updatedAt: 1 };
}

// A typed child that echoes what it was handed: no capture of its own.
const echo: AutomationStudioSubflowGraph = {
  subflowId: "echo",
  graphRevision: 1,
  graph: graph("graph.echo", [
    { id: "start", definitionId: "builtin.control.start" },
    { id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("items") } },
    { id: "pick", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("first", null) } }
  ]),
  artifact: { interface: { inputs: [
    { id: "items", name: "Items", valueType: { kind: "json" } },
    { id: "first", name: "First", valueType: { kind: "json" } }
  ], outputs: [] }, errors: [] } as unknown as NonNullable<AutomationStudioSubflowGraph["artifact"]>
};

function parent(inputs: Record<string, JsonValue>, before: AutomationStudioFlowNode[] = [], wires: AutomationStudioFlowDocument["edges"] = []): AutomationStudioFlowDocument {
  const flow = graph("graph.records-parent", [
    { id: "start", definitionId: "builtin.control.start" },
    extractNode,
    ...before,
    { id: "call", definitionId: CALL, parameterValues: { subflowId: "echo", inputs, outputs: { "echo.value": "echoed", "pick.value": "picked" } } }
  ]);
  return { ...flow, edges: [...flow.edges, ...wires] };
}

// Filter List keeps the captured row objects themselves in a new array (graph-run's captured-record fixtures).
const filterNode: AutomationStudioFlowNode = { id: "filter", definitionId: "builtin.data.filter-list", parameterValues: { path: "price", operator: "exists" } };
const filterWire = { id: "extract.records.filter.items", sourceNodeId: "extract", sourcePortId: "records", targetNodeId: "filter", targetPortId: "items" };

/** `handed` is what the boundary gave the runner; `entry` is what the child graph actually executed with. */
type Child = { handed: Record<string, JsonValue>; entry: Record<string, JsonValue>; saved: AutomationStudioGraphExecutionTrace };

async function run(flow: AutomationStudioFlowDocument, extra: Partial<AutomationStudioGraphExecutionOptions> = {}) {
  const children: Child[] = [];
  const invocation = automationStudioRootInvocation(flow, { currentSubflowId: "main" }, async (target, options, onExecuted) => {
    let entry: Record<string, JsonValue> = {};
    const saved = await runAutomationStudioGraph(target.graph, options, (real, kept) => {
      entry = real.values;
      onExecuted?.(real, kept);
    });
    children.push({ handed: options.inputs ?? {}, entry, saved });
    return saved;
  });
  let executed: AutomationStudioGraphExecutionTrace | undefined;
  const saved = await runAutomationStudioGraph(flow, {
    inputs: {}, currentSubflowId: "main", invocation, subflowGraphs: { load: async (id) => (id === "echo" ? echo : undefined) },
    effectDispatcher: extractionDispatcher(), ...extra
  }, (trace) => { executed = trace; });
  const attempt = (trace: AutomationStudioGraphExecutionTrace | undefined, nodeId: string) => trace?.attempts.find((candidate) => candidate.nodeId === nodeId);
  return { saved, executed: executed!, children, extracted: attempt(executed, "extract")?.outputs.records as JsonValue[], call: attempt(executed, "call")!, savedCall: attempt(saved, "call")! };
}

function withoutClock(values: Record<string, JsonValue>): Record<string, JsonValue> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => key !== "startedAt" && key !== "start.startedAt"));
}

/** A normal authority that approves every frame and fork; it knows nothing about record identity. */
function accepting() {
  const opened: AutomationStudioInputUseFrameCapture[] = [], forks: AutomationStudioInputUseChildCapture[] = [];
  const authority: AutomationStudioInputUseAuthority = {
    open: async (capture) => {
      opened.push(capture);
      const held = structuredClone(capture.values);
      return { status: "bound", value: { reference: { ownerId: "synthetic-owner", bindingId: `synthetic-binding-${opened.length}`, revision: 1 },
        executionCopy: () => structuredClone(held), verifyCurrent: async () => ({ status: "bound", value: true }), close: () => {} } };
    },
    child: async (capture) => {
      forks.push(capture);
      return { status: "bound", value: authority };
    }
  };
  return { session: new AutomationStudioGraphInputUseSession(authority), opened, forks };
}

describe("captured rows handed into a typed Call Subflow", () => {
  it("returns the parent's very rows and keeps its dataset markers, with or without an accepting authority", async () => {
    const flow = parent({ items: automationNodeStateBinding("extract.records") });
    const ordinary = await run(flow);
    const proof = accepting();
    const observed = await run(flow, { inputUse: proof.session.port });
    for (const [label, result] of [["ordinary", ordinary], ["accepting authority", observed]] as const) {
      expect(result.saved.status, `${label}: ${result.saved.message ?? ""}`).toBe("succeeded");
      expect(Array.isArray(result.extracted)).toBe(true);
      expect.soft(result.children[0]?.handed.items, `${label}: boundary handoff array identity`).toBe(result.extracted);
      expect.soft(result.children[0]?.entry.items, `${label}: child entry array identity`).toBe(result.extracted);
      expect.soft(result.call.outputs.echoed, `${label}: echoed array identity`).toBe(result.extracted);
      expect.soft((result.call.outputs.echoed as JsonValue[])[0], `${label}: echoed row identity`).toBe(result.extracted[0]);
      expect.soft(result.saved.values.echoed, `${label}: saved value marker`).toEqual(extractedDataset);
      expect.soft(result.savedCall.outputs.echoed, `${label}: saved call output marker`).toEqual(extractedDataset);
      expect.soft(JSON.stringify(result.saved), `${label}: raw row text`).not.toContain(ROW);
      expect.soft(JSON.stringify(result.executed), `${label}: excluded field (executed)`).not.toContain(EXCLUDED_NOTE);
      expect.soft(JSON.stringify(result.saved), `${label}: excluded field (saved)`).not.toContain(EXCLUDED_NOTE);
    }
    // The Start node reports its wall-clock start, which differs between two runs; every other saved value is compared.
    expect.soft(withoutClock(observed.saved.values), "saved values equal ordinary").toEqual(withoutClock(ordinary.saved.values));
    expect.soft(observed.savedCall.outputs, "saved call outputs equal ordinary").toEqual(ordinary.savedCall.outputs);
    expect(observed.saved.status).toBe(ordinary.saved.status);
    // Graph entry stays sealed; the child's input use is unknown and no normal authority was asked for it.
    expect(proof.session.read(observed.saved)).toMatchObject({ status: "sealed", coverage: "graph_entry_inputs" });
    expect.soft(proof.forks, "child authority calls").toHaveLength(0);
    expect.soft(proof.opened, "authority opens").toHaveLength(1);
    expect.soft(proof.session.read(observed.children[0]!.saved), "child input-use observation").toEqual({ status: "unknown", code: "captured_records" });
  });

  it("finds captured arrays and rows nested inside other inputs, and keeps each marker", async () => {
    const flow = parent({ items: { wrapped: [{ rows: automationNodeStateBinding("extract.records") }] }, first: automationNodeStateBinding("filter.items") }, [filterNode], [filterWire]);
    const proof = accepting();
    const observed = await run(flow, { inputUse: proof.session.port });
    expect(observed.saved.status, observed.saved.message).toBe("succeeded");
    const handed = observed.children[0]!.entry;
    expect((handed.items as { wrapped: Array<{ rows: JsonValue }> }).wrapped[0]!.rows).toBe(observed.extracted);
    expect((handed.first as JsonValue[])[0]).toBe(observed.extracted[0]);
    expect((observed.call.outputs.picked as JsonValue[])[0]).toBe(observed.extracted[0]);
    expect(observed.saved.values.echoed).toEqual({ wrapped: [{ rows: extractedDataset }] });
    expect(observed.saved.values.picked).toEqual([firstRowMarker]);
    expect(JSON.stringify(observed.saved)).not.toContain(ROW);
    expect(proof.forks).toHaveLength(0);
    expect(proof.session.read(observed.children[0]!.saved)).toEqual({ status: "unknown", code: "captured_records" });
  });

  it("gives equal-valued but independently built data normal handling while the run holds captured rows", async () => {
    const lookalike = [{ name: ROW, price: 3 }, { name: `${ROW}-second` }];
    const flow = parent({ items: automationNodeStateBinding("copy.value") }, [{ id: "copy", definitionId: "builtin.data.constant", parameterValues: { value: lookalike } }]);
    const proof = accepting();
    const observed = await run(flow, { inputUse: proof.session.port });
    expect(observed.saved.status).toBe("succeeded");
    expect(observed.extracted).toEqual(lookalike);
    expect(proof.forks).toHaveLength(1);
    expect(proof.opened).toHaveLength(2);
    expect(proof.session.read(observed.children[0]!.saved)).toMatchObject({ status: "sealed", coverage: "graph_entry_inputs" });
    // Normal handling executes the child from its authenticated lease copy, never by matching values to rows.
    expect(observed.children[0]!.entry.items).toEqual(lookalike);
    expect(observed.children[0]!.entry.items).not.toBe(observed.call.inputs["copy.value"]);
    expect(observed.saved.values.echoed).not.toEqual(extractedDataset);
  });

  it("keeps an inspection that cannot answer unknown and executes the original objects", async () => {
    const guarded = { get label() { return "synthetic-accessor"; } };
    const flow = parent({ items: automationNodeStateBinding("native.value") }, [{ id: "native", definitionId: "synthetic.native" }]);
    const proof = accepting();
    const observed = await run(flow, { inputUse: proof.session.port, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: { value: guarded as unknown as JsonValue } } }) });
    expect(observed.saved.status).toBe("succeeded");
    expect(observed.children[0]!.entry.items).toBe(guarded);
    expect(proof.forks).toHaveLength(0);
    expect(proof.opened).toHaveLength(1);
    expect(proof.session.read(observed.children[0]!.saved)).toEqual({ status: "unknown", code: "records_unavailable" });
  });
});
