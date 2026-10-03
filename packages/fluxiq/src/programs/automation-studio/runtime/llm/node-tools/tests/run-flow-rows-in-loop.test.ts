// A repeat in a build's own test, run once per row (design t252 D6, t252-w9).
//
// The walker can tell a list span from a check span, and which members take
// the row, only from each step's node. The loop hands its `nodeOf` to every
// place it sends its steps again -- the dry run and `core.run_flow` -- so a
// repeated press is sent once for each row the list returned in this test,
// each with that row. Without it a repeat is sent once on the explored row, as
// before t252.
import { describe, expect, it, vi } from "vitest";
// The llm barrel first, as `../../decision-context/tests/recorded-runs.ts` says why.
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftReplayNode } from "../replay-span.ts";

const tools = [
  { toolId: "list", description: "Read the items.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }
];

const NODES: Record<string, AutomationStudioFlowDraftReplayNode> = {
  "node.list": { inputs: [], outputs: [{ id: "records", type: "array" }] },
  "node.press": { inputs: [{ id: "item" }], outputs: [] }
};

const ROWS = [{ name: "Ada" }, { name: "Ben" }, { name: "Cy" }];

/** A draft the build already took: a list read, then a press repeated over its rows. */
function seed(): AutomationStudioFlowDraftStep[] {
  const from = { from: { location: "https://store.test/items" } };
  return [
    { position: 1, id: "r1", iteration: 1, actionId: "node.list", toolId: "list", input: { target: "items" }, ranWith: { target: "items" }, replay: from, effect: "observe", effectApplied: true, proposes: true, disposition: "kept" },
    { position: 2, id: "r2", iteration: 2, actionId: "node.press", toolId: "press", input: { target: "Accept" }, ranWith: { target: "Accept" }, replay: from, effect: "mutate", effectApplied: true, proposes: true, disposition: "kept", routing: { kind: "repeat", over: "r1", through: "r2" } }
  ];
}

/** A target that answers every replayed call as reproduced, and a replayed list read with its rows. */
function store() {
  return vi.fn(async ({ toolId, value }: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }) => ({
    kind: "llm_evidence_tool_execution",
    evidence: { replay: value.replay ?? null },
    effectApplied: value.replay === "reset" || toolId === "press",
    resultCode: "core.replay.replayed",
    ...(toolId === "list" && value.replay !== undefined ? { outputs: { records: ROWS } } : {})
  }));
}

async function build(withNodes: boolean) {
  const decide = vi.fn()
    .mockResolvedValueOnce({ kind: "tool_call", callId: "part.1", toolId: "core.run_flow", input: { from: 1 } })
    .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
  const executeTool = store();
  const result = await runAutomationStudioLlmEvidenceLoop({
    tools, decide, executeTool, draft: { seed: seed() }, maxIterations: 6, maxToolCalls: 6, propagateDecisionErrors: true,
    ...(withNodes ? { nodeOf: (id: string) => NODES[id] } : {})
  });
  const presses = (prefix: string) => executeTool.mock.calls.map(([call]) => call)
    .filter((call) => call.toolId === "press" && call.callId.startsWith(prefix))
    .map((call) => (call.value.item as JsonObject | undefined)?.name ?? null);
  return { result, presses };
}

describe("a build's repeat, given the nodes its steps name", () => {
  it("presses once per row of the list, with that row, in core.run_flow and in the dry run", async () => {
    const { result, presses } = await build(true);
    expect(result).toMatchObject({ ok: true });
    expect(presses("part.1")).toEqual(["Ada", "Ben", "Cy"]);
    expect(presses("dryrun.")).toEqual(["Ada", "Ben", "Cy"]);
  });

  it("presses once on the explored row when the loop is given no nodes", async () => {
    const { result, presses } = await build(false);
    expect(result).toMatchObject({ ok: true });
    expect(presses("part.1")).toEqual([null]);
    expect(presses("dryrun.")).toEqual([null]);
  });
});
