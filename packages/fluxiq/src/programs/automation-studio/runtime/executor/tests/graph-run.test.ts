import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationNodeStateBinding } from "../../../nodes/index.ts";
import {
  AUTOMATION_STUDIO_WITHHELD_VALUE,
  runAutomationStudioGraph,
  type AutomationStudioGraphExecutionOptions,
  type AutomationStudioGraphExecutionTrace
} from "../index.ts";

// Obviously synthetic: every assertion about these is where they must not appear.
const SUPPLIED = "synthetic-run-input-that-must-never-be-persisted";
const SUPPLIED_NUMBER = 8830417;

const authoredFlow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.unread-input",
  ownerKind: "task",
  ownerId: "task.unread-input",
  name: "Unread input",
  createdAt: 1,
  updatedAt: 1,
  nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "confirm", retries: 3 } } }],
  edges: []
};

describe("a run input no node reads, and the persisted trace", () => {
  it("withholds it from the run's values and every attempt's inputs, keeping its key, while the Flow's authored values stay", async () => {
    const withheldTexts: Array<string[] | undefined> = [];
    const trace = await runAutomationStudioGraph(authoredFlow, {
      inputs: { "run.unread.text": SUPPLIED, "run.unread.count": SUPPLIED_NUMBER, "run.unread.flag": true },
      effectDispatcher: (_effect, context) => {
        withheldTexts.push(context?.withheldValues?.texts);
        return { status: "success", route: "success", outputs: { ok: true } };
      }
    });

    expect(trace.status).toBe("succeeded");
    expect(JSON.stringify(trace)).not.toContain(SUPPLIED);
    expect(JSON.stringify(trace)).not.toContain(String(SUPPLIED_NUMBER));
    const withheldInputs = { "run.unread.text": AUTOMATION_STUDIO_WITHHELD_VALUE, "run.unread.count": AUTOMATION_STUDIO_WITHHELD_VALUE, "run.unread.flag": true };
    expect(trace.values).toMatchObject(withheldInputs);
    expect(trace.attempts[0]?.inputs).toMatchObject(withheldInputs);
    expect(trace.effects[0]?.payload).toMatchObject({ outputId: "activate-element", parameters: { elementId: "confirm", retries: 3 } });
    // No binding resolved it, so no dispatch is told to withhold it, and no command carries it.
    expect(withheldTexts).toEqual([undefined]);
  });

  it("keeps a value the run computed even when it equals an input", async () => {
    const trace = await runAutomationStudioGraph({
      ...authoredFlow,
      flowId: "flow.computed-equals-input",
      nodes: [{ id: "start", definitionId: "builtin.control.start" }, { id: "sum", definitionId: "builtin.math.add", parameterValues: { precision: 0 } }],
      edges: [{ id: "start.sum", sourceNodeId: "start", targetNodeId: "sum", sourcePortId: "success", targetPortId: "in" }]
    }, { inputs: { left: 5, right: 0 } });

    expect(trace.status).toBe("succeeded");
    expect(trace.values).toMatchObject({ left: AUTOMATION_STUDIO_WITHHELD_VALUE, right: AUTOMATION_STUDIO_WITHHELD_VALUE, result: 5 });
  });

  it("hands a caller that goes on executing the trace as the run executed it, beside the saved trace it returns", async () => {
    const handed: Array<{ executed: AutomationStudioGraphExecutionTrace; saved: AutomationStudioGraphExecutionTrace }> = [];
    const trace = await runAutomationStudioGraph(authoredFlow, {
      inputs: { "run.unread.text": SUPPLIED },
      effectDispatcher: () => ({ status: "success", route: "success", outputs: { ok: true } })
    }, (executed, saved) => { handed.push({ executed, saved }); });

    expect(handed).toHaveLength(1);
    expect(handed[0]?.saved).toBe(trace);
    expect(handed[0]?.executed.values["run.unread.text"]).toBe(SUPPLIED);
    expect(handed[0]?.executed.attempts[0]?.inputs["run.unread.text"]).toBe(SUPPLIED);
    expect(trace.values["run.unread.text"]).toBe(AUTOMATION_STUDIO_WITHHELD_VALUE);
    expect(JSON.stringify(trace)).not.toContain(SUPPLIED);
  });
});

// Obviously synthetic: every assertion about these is where they must or must not appear.
const ROW = "synthetic-extracted-row-that-must-never-be-persisted";
const EXCLUDED_NOTE = "synthetic-excluded-note-that-must-never-be-held";

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

const extractFlow: AutomationStudioFlowDocument = {
  ...authoredFlow,
  flowId: "flow.records-saved-trace",
  nodes: [extractNode, { id: "after", definitionId: "builtin.policy.action", parameterValues: { outputId: "after-extract" } }],
  edges: [{ id: "extract.after", sourceNodeId: "extract", targetNodeId: "after", sourcePortId: "success" }]
};

const extractedDataset = { $dataset: { datasetId: "products", recordCount: 2 } };

function extractionDispatcher(): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> {
  return (effect) => (effect.payload as { outputId?: unknown } | undefined)?.outputId === "extract-list"
    ? { status: "success", route: "success", outputs: { ok: true, result: { items: [{ name: ROW, price: 3, note: EXCLUDED_NOTE }, { name: `${ROW}-second`, note: EXCLUDED_NOTE }] } } }
    : { status: "success", route: "success", outputs: { ok: true } };
}

describe("captured records and the saved trace", () => {
  it("holds markers in values and in a later node's inputs, while the executed trace holds the rows and no excluded field", async () => {
    const executed: AutomationStudioGraphExecutionTrace[] = [];
    const saved = await runAutomationStudioGraph(extractFlow, { effectDispatcher: extractionDispatcher() }, (run) => { executed.push(run); });

    expect(saved.status).toBe("succeeded");
    expect(JSON.stringify(executed[0]?.values)).toContain(ROW);
    expect(JSON.stringify(executed[0]?.attempts[1]?.inputs)).toContain(ROW);
    expect(JSON.stringify(executed[0])).not.toContain(EXCLUDED_NOTE);
    expect(JSON.stringify(saved)).not.toContain(ROW);
    expect(saved.values["extract.records"]).toEqual(extractedDataset);
    expect(saved.values.records).toEqual(extractedDataset);
    expect(saved.attempts[1]?.inputs["extract.records"]).toEqual(extractedDataset);
    expect(saved.attempts[0]?.outputs.result).toEqual({ items: extractedDataset });
  });

  it("hands records over a data edge into Filter List, whose kept rows are row markers in the saved trace", async () => {
    const flow: AutomationStudioFlowDocument = {
      ...extractFlow,
      flowId: "flow.records-filter",
      nodes: [extractNode, { id: "filter", definitionId: "builtin.data.filter-list", parameterValues: { path: "price", operator: "exists" } }],
      edges: [
        { id: "extract.filter", sourceNodeId: "extract", sourcePortId: "success", targetNodeId: "filter", targetPortId: "in" },
        { id: "extract.records.filter.items", sourceNodeId: "extract", sourcePortId: "records", targetNodeId: "filter", targetPortId: "items" }
      ]
    };
    const executed: AutomationStudioGraphExecutionTrace[] = [];
    const saved = await runAutomationStudioGraph(flow, { effectDispatcher: extractionDispatcher() }, (run) => { executed.push(run); });
    const extracted = executed[0]?.attempts[0]?.outputs.records as JsonValue[];

    expect(saved.status).toBe("succeeded");
    expect(executed[0]?.attempts[1]?.inputs.items).toBe(extracted);
    expect(executed[0]?.attempts[1]?.outputs.items).toEqual([{ name: ROW, price: 3 }]);
    expect((executed[0]?.attempts[1]?.outputs.items as JsonValue[])[0]).toBe(extracted[0]);
    expect(saved.attempts[1]?.inputs.items).toEqual(extractedDataset);
    expect(saved.attempts[1]?.outputs.items).toEqual([{ $datasetRow: { datasetId: "products", ordinal: 1 } }]);
    expect(JSON.stringify(saved)).not.toContain(ROW);
  });

  it("replaces a Call Flow child's rows with markers in the parent's saved trace", async () => {
    const childFlow: AutomationStudioFlowDocument = { ...extractFlow, flowId: "flow.records-child", nodes: [extractNode], edges: [] };
    const parentFlow: AutomationStudioFlowDocument = { ...extractFlow, flowId: "flow.records-parent", nodes: [{ id: "call", definitionId: "importer.example.call-flow" }], edges: [] };
    const parentExecuted: AutomationStudioGraphExecutionTrace[] = [];
    const saved = await runAutomationStudioGraph(parentFlow, {
      compositeExecutor: async () => {
        const childExecuted: AutomationStudioGraphExecutionTrace[] = [];
        const childTrace = await runAutomationStudioGraph(childFlow, { effectDispatcher: extractionDispatcher() }, (run) => { childExecuted.push(run); });
        // As the canonical composite executor does: the parent's outputs are the child's executed values.
        return { result: { status: "success", route: "success", outputs: { rows: childExecuted[0]?.values["extract.records"] ?? null } }, childTrace };
      }
    }, (run) => { parentExecuted.push(run); });

    expect(saved.status).toBe("succeeded");
    expect(JSON.stringify(parentExecuted[0]?.attempts[0]?.outputs)).toContain(ROW);
    expect(JSON.stringify(saved)).not.toContain(ROW);
    expect(saved.attempts[0]?.outputs.rows).toEqual(extractedDataset);
    expect(saved.values.rows).toEqual(extractedDataset);
    expect(saved.attempts[0]?.childTrace?.values["extract.records"]).toEqual(extractedDataset);
  });
});

describe("record batch keys", () => {
  const callNode = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "importer.example.call-flow" });
  const childFlow: AutomationStudioFlowDocument = { ...extractFlow, flowId: "flow.keys-child", nodes: [extractNode], edges: [] };
  const middleFlow: AutomationStudioFlowDocument = { ...extractFlow, flowId: "flow.keys-middle", nodes: [callNode("inner")], edges: [] };
  const parentFlow: AutomationStudioFlowDocument = {
    ...extractFlow,
    flowId: "flow.keys-parent",
    nodes: [extractNode, callNode("call")],
    edges: [{ id: "extract.call", sourceNodeId: "extract", targetNodeId: "call", sourcePortId: "success" }]
  };

  // Hands each child run the options the executor passed, as the canonical
  // composite executor does by spreading them: `call` runs the middle Flow,
  // whose `inner` runs the child.
  const compositeExecutor: NonNullable<AutomationStudioGraphExecutionOptions["compositeExecutor"]> = async ({ node, options }) => {
    const childTrace = await runAutomationStudioGraph(node.id === "inner" ? childFlow : middleFlow, options);
    return { result: { status: "success", route: "success", outputs: {} }, childTrace };
  };

  async function batchKeys(flow: AutomationStudioFlowDocument, maxSteps?: number): Promise<Array<{ attemptId: string; batchKey: string }>> {
    const keys: Array<{ attemptId: string; batchKey: string }> = [];
    await runAutomationStudioGraph(flow, {
      effectDispatcher: extractionDispatcher(),
      compositeExecutor,
      ...(maxSteps ? { maxSteps } : {}),
      onRecordBatch: (batch) => {
        keys.push({ attemptId: batch.attemptId, batchKey: batch.batchKey });
        return { runId: "run.synthetic", datasetId: batch.datasetId, nodeIds: [batch.nodeId], schemaDigest: "a".repeat(64), recordCount: batch.rows.length, truncated: false, invalidCount: 0, updatedAt: 1 };
      }
    });
    return keys;
  }

  it("keys a nested Call Flow child's batch apart from its parent's even when their attempt ids are equal", async () => {
    expect(await batchKeys(parentFlow)).toEqual([
      { attemptId: "extract.attempt.1", batchKey: "extract.attempt.1" },
      { attemptId: "extract.attempt.1", batchKey: "call.attempt.2/inner.attempt.1/extract.attempt.1" }
    ]);
  });

  it("keys two invocations of the same child in one run apart", async () => {
    // One Call Flow node run twice: its second attempt starts the same child again.
    const loop: AutomationStudioFlowDocument = { ...extractFlow, flowId: "flow.keys-loop", nodes: [callNode("inner")], edges: [{ id: "inner.inner", sourceNodeId: "inner", targetNodeId: "inner", sourcePortId: "success" }] };
    const keys = await batchKeys(loop, 2);

    expect(keys.map((key) => key.attemptId)).toEqual(["extract.attempt.1", "extract.attempt.1"]);
    expect(keys.map((key) => key.batchKey)).toEqual(["inner.attempt.1/extract.attempt.1", "inner.attempt.2/extract.attempt.1"]);
  });

  it("reproduces the same keys when the same run is run again", async () => {
    const first = await batchKeys(parentFlow);
    const second = await batchKeys(parentFlow);

    expect(first).toHaveLength(2);
    expect(second).toEqual(first);
  });
});

const ENTRY = "synthetic-entry";
const SEED = "synthetic-seed";

describe("run-scoped variables", () => {
  const appendNode = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.data.set-variable", parameterValues: { name: "log", writeMode: "append-list" } });
  // Each Set Variable reads `value` from the Constant's output.
  const appendFlow: AutomationStudioFlowDocument = {
    ...authoredFlow,
    flowId: "flow.run-variables",
    nodes: [{ id: "entry", definitionId: "builtin.data.constant", parameterValues: { value: ENTRY } }, appendNode("first"), appendNode("second"), appendNode("third")],
    edges: [
      { id: "entry.first", sourceNodeId: "entry", targetNodeId: "first", sourcePortId: "success" },
      { id: "first.second", sourceNodeId: "first", targetNodeId: "second", sourcePortId: "success" },
      { id: "second.third", sourceNodeId: "second", targetNodeId: "third", sourcePortId: "success" }
    ]
  };

  it("lets set-variable in append-list mode accumulate across three nodes", async () => {
    const trace = await runAutomationStudioGraph(appendFlow);

    expect(trace.status).toBe("succeeded");
    expect(trace.values["first.next"]).toEqual([ENTRY]);
    expect(trace.values["second.next"]).toEqual([ENTRY, ENTRY]);
    expect(trace.values["third.next"]).toEqual([ENTRY, ENTRY, ENTRY]);
  });

  it("does not carry variables from one run into the next, or write them back to the options", async () => {
    const options: AutomationStudioGraphExecutionOptions = { variables: { log: [SEED] } };
    const first = await runAutomationStudioGraph(appendFlow, options);
    const second = await runAutomationStudioGraph(appendFlow, options);

    expect(first.values["third.next"]).toEqual([SEED, ENTRY, ENTRY, ENTRY]);
    expect(second.values["third.next"]).toEqual([SEED, ENTRY, ENTRY, ENTRY]);
    expect(options.variables).toEqual({ log: [SEED] });
  });
});

describe("For Each in a graph run", () => {
  const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}.${targetPortId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId });

  it("completes 300 items through a two-node body, past the run's default 250 steps", async () => {
    const items = Array.from({ length: 300 }, (_, index) => index);
    const flow: AutomationStudioFlowDocument = {
      ...authoredFlow,
      flowId: "flow.for-each-300",
      nodes: [
        { id: "start", definitionId: "builtin.control.start" },
        { id: "list", definitionId: "builtin.data.constant", parameterValues: { value: items } },
        { id: "each", definitionId: "builtin.control.for-each", parameterValues: { maxIterations: 300 } },
        { id: "remember", definitionId: "builtin.data.set-variable", parameterValues: { name: "seen", writeMode: "append-list" } },
        { id: "recall", definitionId: "builtin.data.get-variable", parameterValues: { name: "seen" } },
        { id: "end", definitionId: "builtin.control.end" }
      ],
      edges: [
        edge("start", "success", "list"),
        edge("list", "success", "each"),
        edge("list", "value", "each", "items"),
        edge("each", "body", "remember"),
        edge("each", "item", "remember", "value"),
        edge("remember", "success", "recall"),
        edge("recall", "success", "each"),
        edge("each", "done", "end")
      ]
    };

    const trace = await runAutomationStudioGraph(flow);
    const passes = trace.attempts.filter((attempt) => attempt.nodeId === "each");

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts).toHaveLength(2 + 301 + 600 + 1);
    expect(passes.map((attempt) => attempt.route)).toEqual([...items.map(() => "body"), "done"]);
    expect(passes[299]?.outputs).toEqual({ item: 299, index: 299, count: 300 });
    expect(trace.values["recall.value"]).toEqual(items);
  });

  it("keeps each For Each node's place its own, so a nested pair runs every pairing", async () => {
    const flow: AutomationStudioFlowDocument = {
      ...authoredFlow,
      flowId: "flow.for-each-nested",
      nodes: [
        { id: "outerList", definitionId: "builtin.data.constant", parameterValues: { value: ["a", "b"] } },
        { id: "outer", definitionId: "builtin.control.for-each" },
        { id: "innerList", definitionId: "builtin.data.constant", parameterValues: { value: [1, 2, 3] } },
        { id: "inner", definitionId: "builtin.control.for-each" },
        { id: "visit", definitionId: "builtin.data.constant", parameterValues: { value: "synthetic-visit" } },
        { id: "end", definitionId: "builtin.control.end" }
      ],
      edges: [
        edge("outerList", "success", "outer"),
        edge("outerList", "value", "outer", "items"),
        edge("outer", "body", "innerList"),
        edge("innerList", "success", "inner"),
        edge("innerList", "value", "inner", "items"),
        edge("inner", "body", "visit"),
        edge("visit", "success", "inner"),
        edge("inner", "done", "outer"),
        edge("outer", "done", "end")
      ]
    };

    const trace = await runAutomationStudioGraph(flow);
    const items = (nodeId: string, route: string) => trace.attempts.filter((attempt) => attempt.nodeId === nodeId && attempt.route === route).map((attempt) => attempt.outputs.item);

    expect(trace.status).toBe("succeeded");
    expect(items("outer", "body")).toEqual(["a", "b"]);
    // The inner list runs whole for each outer item: its place is its own, and it is forgotten at done.
    expect(items("inner", "body")).toEqual([1, 2, 3, 1, 2, 3]);
    expect(trace.attempts.filter((attempt) => attempt.nodeId === "inner" && attempt.route === "done")).toHaveLength(2);
  });

  it("stops a run at 100,000 steps when its caller asks for more", async () => {
    const flow: AutomationStudioFlowDocument = {
      ...authoredFlow,
      flowId: "flow.step-ceiling-caller",
      nodes: [{ id: "spin", definitionId: "builtin.data.constant", parameterValues: { value: 1 } }],
      edges: [edge("spin", "success", "spin")]
    };

    const trace = await runAutomationStudioGraph(flow, { maxSteps: 100_001 });

    expect(trace.status).toBe("failed");
    expect(trace.message).toBe("Maximum step count exceeded: 100000.");
    expect(trace.attempts).toHaveLength(100_000);
  }, 120_000);

  it("stops a run at 100,000 steps when a For Each grants more", async () => {
    const flow: AutomationStudioFlowDocument = {
      ...authoredFlow,
      flowId: "flow.step-ceiling-for-each",
      nodes: [
        { id: "list", definitionId: "builtin.data.constant", parameterValues: { value: [1] } },
        { id: "each", definitionId: "builtin.control.for-each", parameterValues: { maxStepsPerIteration: 100_000 } },
        { id: "spin", definitionId: "builtin.data.constant", parameterValues: { value: 1 } }
      ],
      edges: [edge("list", "success", "each"), edge("list", "value", "each", "items"), edge("each", "body", "spin"), edge("spin", "success", "spin")]
    };

    const trace = await runAutomationStudioGraph(flow);

    expect(trace.status).toBe("failed");
    expect(trace.message).toBe("Maximum step count exceeded: 100000.");
    expect(trace.attempts).toHaveLength(100_000);
  }, 120_000);

  it("hands each captured row to its body by reference, so each item in the saved trace is a row marker", async () => {
    const flow: AutomationStudioFlowDocument = {
      ...extractFlow,
      flowId: "flow.for-each-records",
      nodes: [
        extractNode,
        { id: "each", definitionId: "builtin.control.for-each" },
        { id: "visit", definitionId: "builtin.data.constant", parameterValues: { value: "synthetic-visit" } },
        { id: "end", definitionId: "builtin.control.end" }
      ],
      edges: [
        edge("extract", "success", "each"),
        edge("extract", "records", "each", "items"),
        edge("each", "body", "visit"),
        edge("visit", "success", "each"),
        edge("each", "done", "end")
      ]
    };
    const executed: AutomationStudioGraphExecutionTrace[] = [];

    const saved = await runAutomationStudioGraph(flow, { effectDispatcher: extractionDispatcher() }, (run) => { executed.push(run); });
    const rows = executed[0]?.attempts[0]?.outputs.records as JsonValue[];
    const bodyItems = (trace: AutomationStudioGraphExecutionTrace | undefined) => (trace?.attempts ?? []).filter((attempt) => attempt.nodeId === "each" && attempt.route === "body").map((attempt) => attempt.outputs.item);
    const rowMarkers = [{ $datasetRow: { datasetId: "products", ordinal: 1 } }, { $datasetRow: { datasetId: "products", ordinal: 2 } }];

    expect(saved.status).toBe("succeeded");
    expect(rows).toHaveLength(2);
    expect(bodyItems(executed[0])[0]).toBe(rows[0]);
    expect(bodyItems(executed[0])[1]).toBe(rows[1]);
    expect(bodyItems(saved)).toEqual(rowMarkers);
    expect(saved.attempts.find((attempt) => attempt.nodeId === "visit")?.inputs.item).toEqual(rowMarkers[0]);
    expect(saved.values.item).toEqual(rowMarkers[1]);
    expect(JSON.stringify(saved)).not.toContain(ROW);
  });
});

/** The variable a For Each body accumulates its rows into; no node output is keyed like it. */
const CARRIED = "rowLog";

// A For Each body that remembers the rows it visited, and a node after the loop
// that reads them back: the pattern K6 makes obvious. The rows a variable
// carries must still be markers in the saved trace (CD14), and the binding must
// read what the body wrote rather than the run's seed (CD18).
describe("captured rows carried through a run variable", () => {
  const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}.${targetPortId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId });
  const rowMarkers = [{ $datasetRow: { datasetId: "products", ordinal: 1 } }, { $datasetRow: { datasetId: "products", ordinal: 2 } }];

  function carryFlow(reader: AutomationStudioFlowNode): AutomationStudioFlowDocument {
    return {
      ...extractFlow,
      flowId: `flow.rows-through-variable.${reader.definitionId}`,
      nodes: [
        extractNode,
        { id: "each", definitionId: "builtin.control.for-each" },
        { id: "remember", definitionId: "builtin.data.set-variable", parameterValues: { name: CARRIED, writeMode: "append-list" } },
        reader,
        { id: "end", definitionId: "builtin.control.end" }
      ],
      edges: [
        edge("extract", "success", "each"),
        edge("extract", "records", "each", "items"),
        edge("each", "body", "remember"),
        edge("each", "item", "remember", "value"),
        edge("remember", "success", "each"),
        edge("each", "done", reader.id),
        edge(reader.id, "success", "end")
      ]
    };
  }

  async function runCarrying(reader: AutomationStudioFlowNode): Promise<{ executed: AutomationStudioGraphExecutionTrace | undefined; saved: AutomationStudioGraphExecutionTrace }> {
    const executed: AutomationStudioGraphExecutionTrace[] = [];
    const saved = await runAutomationStudioGraph(carryFlow(reader), { effectDispatcher: extractionDispatcher() }, (run) => { executed.push(run); });
    return { executed: executed[0], saved };
  }

  it("keeps each remembered row the same object, so Get Variable reads markers in the saved trace", async () => {
    const { executed, saved } = await runCarrying({ id: "recall", definitionId: "builtin.data.get-variable", parameterValues: { name: CARRIED } });
    const rows = executed?.attempts[0]?.outputs.records as JsonValue[];
    const remembered = executed?.values["recall.value"] as JsonValue[];

    expect(saved.status).toBe("succeeded");
    expect(remembered).toHaveLength(2);
    // Identity is what the saved trace's markers are found by: a copy is not the captured row.
    expect(remembered[0]).toBe(rows[0]);
    expect(remembered[1]).toBe(rows[1]);
    expect(saved.values["recall.value"]).toEqual(rowMarkers);
    expect(JSON.stringify(saved)).not.toContain(ROW);
    expect(JSON.stringify(saved)).not.toContain(EXCLUDED_NOTE);
  });

  it("keeps a whole captured list the same array, so the saved trace holds one dataset marker", async () => {
    const flow: AutomationStudioFlowDocument = {
      ...extractFlow,
      flowId: "flow.rows-through-variable.whole-list",
      nodes: [
        extractNode,
        { id: "remember", definitionId: "builtin.data.set-variable", parameterValues: { name: CARRIED, writeMode: "replace" } },
        { id: "recall", definitionId: "builtin.data.get-variable", parameterValues: { name: CARRIED } },
        { id: "end", definitionId: "builtin.control.end" }
      ],
      edges: [
        edge("extract", "success", "remember"),
        edge("extract", "records", "remember", "value"),
        edge("remember", "success", "recall"),
        edge("recall", "success", "end")
      ]
    };
    const executed: AutomationStudioGraphExecutionTrace[] = [];
    const saved = await runAutomationStudioGraph(flow, { effectDispatcher: extractionDispatcher() }, (run) => { executed.push(run); });
    const rows = executed[0]?.attempts[0]?.outputs.records as JsonValue[];

    expect(saved.status).toBe("succeeded");
    // The captured array itself, not a copy of it: a copy is marked row by row.
    expect(executed[0]?.values["recall.value"]).toBe(rows);
    expect(saved.values["recall.value"]).toEqual(extractedDataset);
    expect(JSON.stringify(saved)).not.toContain(ROW);
  });

  it("resolves a later node's binding from what the body wrote, with the rows it read still markers", async () => {
    const { executed, saved } = await runCarrying({ id: "recall", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding(CARRIED) } });
    const rows = executed?.attempts[0]?.outputs.records as JsonValue[];
    const bound = executed?.values["recall.value"] as JsonValue[];

    expect(saved.status).toBe("succeeded");
    // The seed holds no such variable, so a binding that reads it resolved the body's writes.
    expect(bound).toHaveLength(2);
    expect(bound[0]).toBe(rows[0]);
    expect(saved.values["recall.value"]).toEqual(rowMarkers);
    expect(JSON.stringify(saved)).not.toContain(ROW);
    expect(JSON.stringify(saved)).not.toContain(EXCLUDED_NOTE);
  });
});
