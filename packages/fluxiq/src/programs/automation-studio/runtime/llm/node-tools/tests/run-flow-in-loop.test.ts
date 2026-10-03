// `core.run_flow` in a build (`../run-flow.ts`, `../../evidence-loop.ts`, t244).
//
// Here rather than in `../../tests/`, which is at its 25 files: the loop is
// the stage, and what is under test is this directory's tool and its binding.
//
// The user's rule (2026-10-02): the build and repair loops can run the Flow
// from a chosen step to test part of it, and it never replaces the whole-Flow
// test. So the loop offers the tool only once the draft holds a step that can
// run again, answers it by sending the Flow's own steps through the same
// executor with nothing reset, counts it as the one tool call the model made,
// writes no step of the draft for it, and still runs the whole Flow again
// before it accepts a result.
import { describe, expect, it, vi } from "vitest";
// The llm barrel first, as `../../decision-context/tests/recorded-runs.ts` says why.
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";

const tools = [
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }
];

/** A store whose press is a step the Flow can run again, and which answers every replay call as reproduced. */
function store() {
  return vi.fn(async ({ value }: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }) => {
    if (value.replay !== undefined) return { kind: "llm_evidence_tool_execution", evidence: { replay: value.replay }, effectApplied: true, resultCode: "core.replay.replayed" };
    return {
      kind: "llm_evidence_tool_execution",
      evidence: { ok: true },
      effectApplied: true,
      resultCode: "web.action.succeeded",
      draft: { actionId: "web.click", effect: "mutate", proposes: true, ranWith: { target: "Add" }, replay: { from: { location: "https://store.test/p" } } }
    };
  });
}

const offeredAt = (decide: { mock: { calls: unknown[][] } }, index: number): string[] =>
  (decide.mock.calls[index]![0] as { tools: { toolId: string }[] }).tools.map((tool) => tool.toolId);

describe("core.run_flow in an evidence loop", () => {
  it("is offered once a step can run again, runs it with nothing reset, records no step, and is one tool call", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "add.1", toolId: "press", input: { target: "Add" }, add: true })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "part.1", toolId: "core.run_flow", input: { from: 1 } })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = store();

    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool, maxIterations: 6, maxToolCalls: 6, propagateDecisionErrors: true });

    expect(result).toMatchObject({ ok: true });
    expect(offeredAt(decide, 0)).toEqual(["press"]);
    expect(offeredAt(decide, 1)).toEqual(["press", "core.run_flow"]);
    // The part ran with no reset; the whole Flow still ran again, from its start, before the result was accepted.
    expect(executeTool.mock.calls.map(([call]) => [call.callId, call.value.replay ?? null])).toEqual([
      ["add.1", null],
      ["part.1.1", "step"],
      ["dryrun.1.reset", "reset"],
      ["dryrun.1.1", "step"]
    ]);
    expect(executeTool.mock.calls[1]![0]).toMatchObject({ toolId: "press", value: { target: "Add", replay: "step", from: { location: "https://store.test/p" } } });
    expect(result.steps.map((step) => [step.callId, step.actionId])).toEqual([["add.1", "web.click"]]);
    expect(result.accounting.toolCalls).toBe(2);
    expect(result.trace.find((row) => row.callId === "part.1")).toMatchObject({ decision: "tool_call", toolId: "core.run_flow", resultCode: "core.run_flow.ran" });
    const shown = (decide.mock.calls[2]![0] as { evidence: { callId: string; value: JsonObject }[] }).evidence.find((entry) => entry.callId === "part.1");
    expect(shown?.value).toMatchObject({ ok: true, passed: true, steps: [{ step: 1, ran: "replayed" }] });
  });

  it("is not offered where the dry run is off, or where the loop keeps no draft", async () => {
    for (const off of [{ dryRun: false as const }, { draft: false as const }]) {
      const decide = vi.fn()
        .mockResolvedValueOnce({ kind: "tool_call", callId: "add.1", toolId: "press", input: { target: "Add" }, add: true })
        .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
      await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: store(), maxIterations: 4, maxToolCalls: 4, propagateDecisionErrors: true, ...off });
      expect(offeredAt(decide, 1)).toEqual(["press"]);
    }
  });
});
