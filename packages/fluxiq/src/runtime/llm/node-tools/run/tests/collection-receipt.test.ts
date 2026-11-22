import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../../flow-authoring/draft/index.ts";
import { runAutomationStudioFlowDraftPart } from "../flow-part.ts";

const ran = { node: "fixture.read", parameters: {} };
const step: AutomationStudioFlowDraftStep = { id: "read", callId: "read", position: 1, iteration: 1, disposition: "kept", proposes: true, effect: "observe", input: ran, ranWith: ran, replay: { from: { location: "fixture://records" } }, toolId: "core.run_node", actionId: "fixture.read" };

describe("fresh-collection receipt production", () => {
  it("carries the actual calls and a new existing-read watermark even when a later invocation reuses call ids", async () => {
    let readSince = 10;
    const started = vi.fn(() => readSince);
    const completed = vi.fn((_receipt: { from: number; to: number; callIds: readonly string[]; readSince: number }) => ({ replaced: true, kind: "fresh_collection" }));
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, effectApplied: false, evidence: {}, resultCode: "core.replay.replayed" }));
    const input = { steps: [step], value: { from: 1 }, callId: "walk", executeTool, forward: { rowDone: () => false, stepDone: () => false, started, completed } };
    const first = await runAutomationStudioFlowDraftPart(input);
    readSince = 11;
    const second = await runAutomationStudioFlowDraftPart(input);
    expect(started).toHaveBeenCalledTimes(2);
    expect(completed.mock.calls.map(([receipt]) => receipt)).toEqual([{ from: 1, to: 1, readSince: 10, callIds: ["walk.1"] }, { from: 1, to: 1, readSince: 11, callIds: ["walk.1"] }]);
    expect(first.evidence).toMatchObject({ sourceReplacement: { replaced: true, kind: "fresh_collection" } });
    expect(second.evidence).toMatchObject({ sourceReplacement: { replaced: true, kind: "fresh_collection" } });
  });
  it("issues no completed receipt on failed or already-aborted starts", async () => {
    const started = vi.fn(() => 1);
    const completed = vi.fn();
    const failed = { steps: [step], value: { from: 1 }, callId: "walk", executeTool: async () => ({ kind: "llm_evidence_tool_execution" as const, effectApplied: false, evidence: {}, resultCode: "core.replay.failed" }), forward: { rowDone: () => false, stepDone: () => false, started, completed } };
    await runAutomationStudioFlowDraftPart(failed);
    expect(completed).not.toHaveBeenCalled();
    started.mockClear();
    const controller = new AbortController();
    controller.abort();
    await runAutomationStudioFlowDraftPart({ ...failed, signal: controller.signal });
    expect(started).not.toHaveBeenCalled();
    expect(completed).not.toHaveBeenCalled();
    const stop = new Error("No started receipt.");
    await expect(runAutomationStudioFlowDraftPart({ ...failed, forward: { ...failed.forward, started: () => { throw stop; } } })).rejects.toBe(stop);
    expect(completed).not.toHaveBeenCalled();
  });
});
