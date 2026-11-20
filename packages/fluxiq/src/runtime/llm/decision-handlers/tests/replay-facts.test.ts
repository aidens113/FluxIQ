// t973: what a replay of the Flow's own steps brought, read by shape from `core.run_flow`'s answer.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceReplayFacts } from "../replay-facts.ts";

describe("the replay fact", () => {
  it("is only for core.run_flow, and not for a refused or failed one", () => {
    expect(automationStudioLlmEvidenceReplayFacts("core.run_node", { from: 3 }, { ok: true, passed: true }, false)).toEqual({});
    expect(automationStudioLlmEvidenceReplayFacts("core.run_flow", { from: 3 }, { ok: true, passed: true }, true)).toEqual({});
    expect(automationStudioLlmEvidenceReplayFacts("core.run_flow", { from: 3 }, { ok: false, code: "core.run_flow.no_step" }, false)).toEqual({});
  });

  it("reached the end only when it passed and ran to the Flow's last step", () => {
    expect(automationStudioLlmEvidenceReplayFacts("core.run_flow", { from: 3 }, { ok: true, passed: true, from: 3, to: 9 }, false)).toEqual({ replay: { changed: false, reachedEnd: true } });
    expect(automationStudioLlmEvidenceReplayFacts("core.run_flow", { from: 3, to: 5 }, { ok: true, passed: true, from: 3, to: 5 }, false)).toEqual({ replay: { changed: false, reachedEnd: false } });
    expect(automationStudioLlmEvidenceReplayFacts("core.run_flow", { from: 3 }, { ok: true, passed: false, stoppedAt: 6 }, false)).toEqual({ replay: { changed: false, reachedEnd: false } });
  });

  it("changed the result when it did a row, or carries Core's note that the result's rows changed", () => {
    expect(automationStudioLlmEvidenceReplayFacts("core.run_flow", { from: 3 }, { ok: true, passed: true, rows: { done: 2, skipped: 0, failed: 0 } }, false)).toMatchObject({ replay: { changed: true } });
    expect(automationStudioLlmEvidenceReplayFacts("core.run_flow", { from: 3 }, { ok: true, passed: true, rows: { done: 0, skipped: 4, failed: 0 } }, false)).toMatchObject({ replay: { changed: false } });
    expect(automationStudioLlmEvidenceReplayFacts("core.run_flow", { from: 3 }, { ok: true, passed: false, resultList: { code: "answer_first.result_list_replaced", rows: 4 } }, false)).toMatchObject({ replay: { changed: true } });
  });
});
