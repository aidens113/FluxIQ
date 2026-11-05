// The forward run (t861, plan D2, `../../replay/forward.ts`): `core.run_flow` runs what the model wrote on the
// rows not yet done, from the page as it stands, and never from the top.
//
// The model does the first row by hand, writes the loop, and the loop does the rest. A row that already took its
// lasting act sends nothing; a lasting step on a new row really acts; a failing pass ends there and the next row runs;
// a step outside a repeat that fails stops the run and leaves the page; no reset and no re-anchor is ever sent. Without
// `forwardRun` the tool and its calls are today's.
// The llm barrel first, as `../../../decision-context/tests/recorded-runs.ts` says why.
import { describe, expect, it, vi } from "vitest";
import { automationStudioLlmRunFlowBinding, automationStudioLlmRunFlowTool, runAutomationStudioFlowDraftPart, runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../flow-authoring/draft/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowDraftReplayPassCall, type AutomationStudioFlowDraftReplayNode } from "../../replay/index.ts";

const REPLAYED = "core.replay.replayed";

const NODES: Record<string, AutomationStudioFlowDraftReplayNode> = {
  "node.list": { inputs: [], outputs: [{ id: "records", type: "array" }] },
  "node.press": { inputs: [{ id: "item" }], outputs: [] }
};
const nodeOf = (id: string) => NODES[id];

const ROWS: JsonObject[] = [{ name: "Ada" }, { name: "Ben" }, { name: "Cyd" }];

const step = (position: number, node: string, over: Partial<AutomationStudioFlowDraftStep> = {}, consequences: string[] = []): AutomationStudioFlowDraftStep => ({
  position,
  id: `d${position}`,
  iteration: position,
  actionId: node,
  toolId: "core.run_node",
  input: { node, parameters: {}, consequences },
  ranWith: { node, parameters: { target: `#s${position}` }, consequences },
  effect: node === "node.list" ? "observe" : "mutate",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  replay: { from: { location: `https://site.test/${position}` } },
  ...over
});

/** A list, a lasting press repeated over it, then a lasting step that takes no row. */
const draft = () => [
  step(1, "node.list"),
  step(2, "node.press", { routing: { kind: "repeat", over: "d1", through: "d2" } }, ["modify_existing"]),
  step(3, "node.press", {}, ["modify_existing"])
];

type Call = { callId: string; toolId: string; value: JsonObject };

function host(options: { answers?: Record<string, string> } = {}) {
  const calls: Call[] = [];
  const executeTool = async (call: Call): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    calls.push(call);
    const code = options.answers?.[call.callId] ?? (call.value.replay === "verify" ? "core.replay.verified" : REPLAYED);
    return {
      kind: "llm_evidence_tool_execution",
      evidence: { call: call.callId },
      effectApplied: code === REPLAYED,
      resultCode: code,
      ...(call.value.node === "node.list" ? { outputs: { records: ROWS } } : {})
    };
  };
  return { calls, executeTool };
}

const names = (calls: Call[]) => calls.map((call) => (call.value.item as JsonObject | undefined)?.name);
const passCalls = (calls: Call[]) => calls.filter((call) => call.callId.includes(".pass."));

function forwardRun(done: string[], stepsDone: number[] = []) {
  const passed: { step: number; row: string | undefined; code: string | undefined }[] = [];
  return {
    passed,
    rowDone: (row: JsonObject) => done.includes(String(row.name)),
    stepDone: (each: AutomationStudioFlowDraftStep) => stepsDone.includes(each.position),
    passedFn: (each: AutomationStudioFlowDraftStep, row: JsonObject | undefined, answer: { resultCode?: string | undefined }) => {
      passed.push({ step: each.position, row: row === undefined ? undefined : String(row.name), code: answer.resultCode });
    }
  };
}

const runForward = (steps: AutomationStudioFlowDraftStep[], executor: ReturnType<typeof host>, forward: ReturnType<typeof forwardRun>, value: JsonObject = { from: 1 }) =>
  runAutomationStudioFlowDraftPart({
    steps, value, callId: "fw", executeTool: executor.executeTool, nodeOf,
    forward: { rowDone: forward.rowDone, stepDone: forward.stepDone, passed: forward.passedFn }
  });

describe("the forward run", () => {
  it("runs passes for the rows not done and sends nothing for a done row", async () => {
    const executor = host();
    const result = await runForward(draft(), executor, forwardRun(["Ada"], [3]));

    expect(names(passCalls(executor.calls))).toEqual(["Ben", "Cyd"]);
    expect(names(executor.calls)).not.toContain("Ada");
    expect(result.evidence).toMatchObject({ ok: true, passed: true, rows: { done: 2, skipped: 1, failed: 0 } });
    // Counts only, never a row's values.
    expect(JSON.stringify((result.evidence as JsonObject).rows)).not.toMatch(/Ada|Ben|Cyd/);
  });

  it("really acts on a new row, and checks a lasting step with no row only when it is done", async () => {
    const executor = host();
    await runForward(draft(), executor, forwardRun(["Ada"], [3]));
    expect(passCalls(executor.calls).map((call) => call.value.replay)).toEqual(["step", "step"]);
    expect(executor.calls.find((call) => call.callId === "fw.3")!.value.replay).toBe("verify");

    const fresh = host();
    await runForward(draft(), fresh, forwardRun(["Ada"], []));
    expect(fresh.calls.find((call) => call.callId === "fw.3")!.value.replay).toBe("step");
  });

  it("sends nothing at all for a lasting member when every row is done", async () => {
    const executor = host();
    const result = await runForward(draft(), executor, forwardRun(["Ada", "Ben", "Cyd"], [3]));
    expect(passCalls(executor.calls)).toEqual([]);
    expect(result.evidence).toMatchObject({ passed: true, rows: { done: 0, skipped: 3, failed: 0 } });
  });

  it("ends a failing pass and goes on with the next row and the steps after, and names the row", async () => {
    const executor = host({ answers: { "fw.2.pass.2": "core.replay.unreproducible" } });
    const result = await runForward(draft(), executor, forwardRun(["Ada"], []));
    expect(names(passCalls(executor.calls))).toEqual(["Ben", "Cyd"]);
    expect(executor.calls.some((call) => call.callId === "fw.3")).toBe(true);
    expect(result.resultCode).toBe("core.run_flow.ran");
    expect(result.evidence).toMatchObject({ passed: false, rows: { done: 1, skipped: 1, failed: 1 } });
  });

  it("stops at a failing step outside a repeat, says which step, and leaves the rest unsent", async () => {
    const executor = host({ answers: { "fw.1": "core.replay.failed" } });
    const result = await runForward(draft(), executor, forwardRun(["Ada"], []));
    expect(passCalls(executor.calls)).toEqual([]);
    expect(executor.calls.some((call) => call.callId === "fw.3")).toBe(false);
    expect(result.resultCode).toBe("core.run_flow.stopped");
    expect(result.evidence).toMatchObject({ passed: false, stoppedAt: 1 });
  });

  it("never sends a reset or a re-anchor", async () => {
    const executor = host({ answers: { "fw.3": "core.replay.unreproducible" } });
    await runForward(draft(), executor, forwardRun(["Ada"], []));
    expect(executor.calls.some((call) => call.value.replay === "reset")).toBe(false);
    expect(executor.calls.some((call) => /\.(reanchor|again)$/.test(call.callId))).toBe(false);
  });

  it("sends a pass in the wire form the Flow builds, and reports each answered call once, with its row", async () => {
    const executor = host();
    const forward = forwardRun(["Ada"], [3]);
    const steps = draft();
    await runForward(steps, executor, forward);
    const ben = executor.calls.find((call) => call.callId === "fw.2.pass.2")!;
    const built = automationStudioFlowDraftReplayPassCall(steps[1]!, "replay", { item: ROWS[1]!, takesRow: true }, NODES["node.press"]);
    expect(built && "value" in built ? ben.value : undefined).toEqual(built && "value" in built ? built.value : null);
    expect(forward.passed).toEqual([
      { step: 1, row: undefined, code: REPLAYED },
      { step: 2, row: "Ben", code: REPLAYED },
      { step: 2, row: "Cyd", code: REPLAYED },
      { step: 3, row: undefined, code: "core.replay.verified" }
    ]);
  });

  it("does not call itself a test, or ask for the Flow to be finished", async () => {
    const result = await runForward(draft(), host(), forwardRun([], [3]));
    const instruction = String((result.evidence as JsonObject).instruction);
    expect(instruction).not.toMatch(/test|finished|judged/i);
    expect(instruction).toMatch(/forward/);
  });

  it("is today's part run without forward: a lasting step is checked and nothing is counted", async () => {
    const executor = host();
    const result = await runAutomationStudioFlowDraftPart({ steps: draft(), value: { from: 1 }, callId: "fw", executeTool: executor.executeTool, nodeOf });
    expect(passCalls(executor.calls).map((call) => call.value.replay)).toEqual(["verify", "verify", "verify"]);
    expect((result.evidence as JsonObject).rows).toBeUndefined();
    expect(String((result.evidence as JsonObject).instruction)).toMatch(/not the Flow's test/);
  });
});

describe("the tool the loop offers", () => {
  const tools = [{ toolId: "press", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }];
  const binding = (extra: object = {}) => automationStudioLlmRunFlowBinding({ tools, executeTool: host().executeTool, steps: [], enabled: true, ...extra });

  it("is today's tool without forward", () => {
    expect(binding().tools.at(-1)).toEqual(automationStudioLlmRunFlowTool());
    expect(automationStudioLlmRunFlowTool(false)).toEqual(automationStudioLlmRunFlowTool());
    expect(automationStudioLlmRunFlowTool().description).toMatch(/never the Flow's test/);
  });

  it("with forward keeps the id and schema, and describes the forward run", () => {
    const today = automationStudioLlmRunFlowTool();
    const forward = binding({ forward: { rowDone: () => false, stepDone: () => false } }).tools.at(-1)!;
    expect(forward.toolId).toBe(today.toolId);
    expect(forward.inputSchema).toEqual(today.inputSchema);
    expect(forward.effect).toBe("mutate");
    expect(forward.description).toMatch(/forward/);
    expect(forward.description).toMatch(/nothing is reset/);
    expect(forward.description).not.toMatch(/never the Flow's test|run whole from its start/);
  });
});

describe("forwardRun in an evidence loop", () => {
  const tools = [{ toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }];
  const store = () => vi.fn(async ({ value }: Call) => {
    if (value.replay !== undefined) return { kind: "llm_evidence_tool_execution", evidence: { replay: value.replay }, effectApplied: true, resultCode: REPLAYED };
    return {
      kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded",
      draft: { actionId: "web.click", effect: "mutate", proposes: true, ranWith: { target: "Add" }, replay: { from: { location: "https://store.test/p" } } }
    };
  });
  const offeredAt = (decide: { mock: { calls: unknown[][] } }, index: number): string[] => (decide.mock.calls[index]![0] as { tools: { toolId: string }[] }).tools.map((tool) => tool.toolId);

  it("offers core.run_flow with the dry run off, runs it forward, and a completion is not dry-run", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "add.1", toolId: "press", input: { target: "Add" }, add: true })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "fw.1", toolId: "core.run_flow", input: { from: 1 } })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = store();
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool, maxIterations: 6, maxToolCalls: 6, propagateDecisionErrors: true,
      dryRun: false, forwardRun: { rowDone: () => false, stepDone: () => false }
    });
    expect(result).toMatchObject({ ok: true });
    expect(offeredAt(decide, 0)).toEqual(["press"]);
    expect(offeredAt(decide, 1)).toEqual(["press", "core.run_flow"]);
    // The forward pass ran, and no dry run (no reset, no whole-Flow replay) followed the completion.
    expect(executeTool.mock.calls.map(([call]) => call.callId)).toEqual(["add.1", "fw.1.1"]);
    expect(executeTool.mock.calls.some(([call]) => call.value.replay === "reset")).toBe(false);
    const shown = (decide.mock.calls[2]![0] as { evidence: { callId: string; value: JsonObject }[] }).evidence.find((entry) => entry.callId === "fw.1");
    expect(String(shown?.value.instruction)).not.toMatch(/test|finished/i);
  });

  it("is not offered with the dry run off and no forwardRun, as today", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "add.1", toolId: "press", input: { target: "Add" }, add: true })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: store(), maxIterations: 4, maxToolCalls: 4, propagateDecisionErrors: true, dryRun: false });
    expect(offeredAt(decide, 1)).toEqual(["press"]);
  });
});
