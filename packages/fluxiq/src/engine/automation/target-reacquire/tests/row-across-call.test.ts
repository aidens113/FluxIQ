// A step of a part its caller handed a row: a stale target is found again from the step that
// read the list, across the frame, by the row's identity. The real engine, For Each and frames; no gate.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../tests/fixture-contracts.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../../index.ts";
import type { AutomationStudioSubflowGraph } from "../../frames/index.ts";
import { automationStudioCallHandsRow, automationStudioStepRepeatsOverRows } from "../index.ts";

const row = { $state: { path: "item" } };

function doc(flowId: string, nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowEdge[]): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId, ownerKind: "routine", ownerId: flowId, name: flowId, nodes, edges, createdAt: 1, updatedAt: 1 };
}
const edge = (id: string, sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in"): AutomationStudioFlowEdge => ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId });

/** Read, then for each row call the part that presses it. */
const caller = (given: JsonValue = row) => doc("graph.site", [
  { id: "start", definitionId: "builtin.control.start" },
  { id: "read", definitionId: "custom.read", metadata: { effect: "observe" } },
  { id: "each", definitionId: "builtin.control.for-each" },
  { id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "press", inputs: { item: given } } },
  { id: "end", definitionId: "builtin.control.end" }
], [
  edge("1", "start", "success", "read"), edge("2", "read", "success", "each"), edge("3", "read", "rows", "each", "items"),
  edge("4", "each", "body", "call"), edge("5", "call", "success", "each"), edge("6", "each", "done", "end")
]);

const press: AutomationStudioSubflowGraph = {
  subflowId: "press", graphRevision: 1,
  graph: doc("graph.press", [{ id: "start", definitionId: "builtin.control.start" }, { id: "press", definitionId: "custom.press", parameterValues: { target: { selector: "#x" } }, metadata: { declaredConsequences: ["create_new"] } }], [edge("p1", "start", "success", "press")])
};

type Page = { rows: JsonObject[]; lost: (key: string, tries: number) => boolean };

async function run(page: Page, flow = caller()): Promise<{ trace: AutomationStudioGraphExecutionTrace; pressed: string[]; handed: JsonValue[]; reads: number; asked: JsonObject[] }> {
  const pressed: string[] = [];
  const handed: JsonValue[] = [];
  const asked: JsonObject[] = [];
  let reads = 0;
  const tries = new Map<string, number>();
  const options: AutomationStudioGraphExecutionOptions = {
    inputs: {}, currentSubflowId: "main", subflowGraphs: { load: async (id) => (id === "press" ? press : undefined) },
    hostRuntime: {
      capabilities: [],
      reacquireTarget: ({ stale, candidates }) => {
        asked.push(stale as JsonObject);
        const found = candidates.filter((candidate) => (candidate as JsonObject).key === (stale as JsonObject).key);
        return found.length === 1 ? { outcome: "found", value: found[0]! } : found.length ? { outcome: "unmatched", reason: "ambiguous" } : { outcome: "gone" };
      }
    },
    nativeNodeExecutor: async ({ node, inputs }) => {
      if (node.id === "read") {
        reads += 1;
        return { result: { status: "success", route: "success", outputs: { rows: page.rows.map((candidate) => ({ ...candidate, $handle: `h${reads}` })) } } };
      }
      const key = String((inputs.item as JsonObject | undefined)?.key);
      const tried = (tries.get(key) ?? 0) + 1;
      tries.set(key, tried);
      if (page.lost(key, tried)) return { result: { status: "failed", route: "failed", outputs: {}, message: "PAGEWORD", failure: { category: "target_not_found", code: "domain.target_lost", retryable: true, stage: "target_resolution", effect: "unacted" } } };
      pressed.push(key);
      handed.push(inputs.item ?? null);
      return { result: { status: "success", route: "success", outputs: {} } };
    }
  };
  const trace = await runAutomationStudioGraph(flow, options);
  return { trace, pressed, handed, reads, asked };
}

const ROWS = [{ key: "a" }, { key: "b" }];

describe("a stale target whose row came across a call", () => {
  it("each pass's press is handed that pass's row, with no re-read when nothing failed", async () => {
    const { trace, pressed, reads } = await run({ rows: ROWS, lost: () => false });
    expect(trace.status).toBe("succeeded");
    expect(pressed).toEqual(["a", "b"]);
    expect(reads).toBe(1);
  });

  it("re-reads the list in the caller's frame after the second failed retry, and the press goes on with the row read fresh", async () => {
    const { trace, pressed, handed, reads, asked } = await run({ rows: ROWS, lost: (key, tries) => key === "b" && tries < 4 });
    expect(trace.status).toBe("succeeded");
    expect(pressed).toEqual(["a", "b"]);
    expect(reads, "the read, and once more for the row that went stale").toBe(2);
    expect(asked).toHaveLength(1);
    expect((asked[0]!).$handle, "what the host matched from is the row as the pass held it").toBe("h1");
    expect((handed[1] as JsonObject).$handle, "the press got the row read fresh, never the old handle").toBe("h2");
  });

  it("a row gone from the fresh list is reported gone, and nothing is pressed for it", async () => {
    const page: Page = { rows: ROWS, lost: (key, tries) => {
      if (key === "b" && tries === 2) page.rows = [{ key: "a" }];
      return key === "b";
    } };
    const { trace, pressed } = await run(page);
    expect(pressed).toEqual(["a"]);
    expect(trace.status).toBe("failed");
    const goneAttempt = trace.attempts.flatMap((attempt) => attempt.childTrace?.attempts ?? []).find((attempt) => attempt.failure?.code === "executor.target.gone");
    expect(goneAttempt?.nodeId).toBe("press");
  });

  it("reads the call step as written: only a row bound from the pass has a lineage to follow", () => {
    const flow = caller();
    const call = flow.nodes.find((node) => node.id === "call")!;
    expect(automationStudioCallHandsRow(flow, call)).toBe(true);
    expect(automationStudioStepRepeatsOverRows(flow, call)).toBe(true);
    const typed = caller({ key: "a" });
    expect(automationStudioCallHandsRow(typed, typed.nodes.find((node) => node.id === "call")!)).toBe(false);
    const field = caller({ $state: { path: "item.key" } });
    expect(automationStudioCallHandsRow(field, field.nodes.find((node) => node.id === "call")!)).toBe(false);
    const named = caller({ $state: { path: "each.item" } });
    expect(automationStudioCallHandsRow(named, named.nodes.find((node) => node.id === "call")!)).toBe(true);
    expect(automationStudioStepRepeatsOverRows(flow, flow.nodes.find((node) => node.id === "read")!)).toBe(false);
  });
});
