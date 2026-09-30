import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../loop-limits/index.ts";
import { automationStudioLlmEvidenceContextWindow, type AutomationStudioLlmEvidenceEntry } from "../context-window.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID } from "../decision-context/index.ts";

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
const page = (callId: string, size: number, toolId = "inspect"): AutomationStudioLlmEvidenceEntry =>
  ({ callId, toolId, value: { page: callId, text: "x".repeat(size) } });
const note = (callId: string): AutomationStudioLlmEvidenceEntry =>
  ({ callId, toolId: "core.request_check", value: { ok: false, code: "llm_evidence_loop.already_answered" } });
// What left the window is recorded by the decision history beside it, never by
// a line inside it.
const listsNothing = (window: readonly AutomationStudioLlmEvidenceEntry[]) =>
  expect(window.some((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID)).toBe(false);

describe("the evidence one decision is shown", () => {
  it("is everything, unchanged and without the loop's bookkeeping, while everything fits", () => {
    const records = [page("call.1", 100), note("core.request_check.2"), page("call.3", 100, "act")];
    const window = automationStudioLlmEvidenceContextWindow(records, 24_000);

    expect(window).toEqual(records.map(({ callId, toolId, value }) => ({ callId, toolId, value })));
    expect(window.every((entry) => Object.keys(entry).join() === "callId,toolId,value")).toBe(true);
  });

  // The measured failure: a realistic build's total reached the old 64,000-byte
  // limit in fourteen calls. The window keeps the newest pages whole, so the
  // total can grow without the request growing with it.
  it("keeps the newest results whole and adds no account of the ones it no longer carries", () => {
    const records = [page("call.1", 9_000), page("call.2", 9_000, "act"), page("call.3", 9_000), page("call.4", 9_000, "act"), page("call.5", 9_000)];
    const window = automationStudioLlmEvidenceContextWindow(records, 24_000);

    expect(bytes(window)).toBeLessThanOrEqual(24_000);
    expect(window.map((entry) => entry.callId)).toEqual(["call.4", "call.5"]);
    expect(window.map((entry) => entry.value)).toEqual([records[3]!.value, records[4]!.value]);
    listsNothing(window);
  });

  it("keeps as many of the most recent results as fit, never quoting part of one", () => {
    const records = [...Array.from({ length: 40 }, (_, index) => page(`call.${index + 1}`, 40)), page("call.41", 1_500)];
    const window = automationStudioLlmEvidenceContextWindow(records, 2_048);

    expect(bytes(window)).toBeLessThanOrEqual(2_048);
    expect(window.at(-1)).toEqual({ callId: "call.41", toolId: "inspect", value: records[40]!.value });
    const shown = window.map((entry) => entry.callId);
    // The newest of the rest, whole, as many as the room left holds.
    expect(shown.slice(0, -1)).toEqual(records.slice(40 - (shown.length - 1), 40).map((record) => record.callId));
    for (const entry of window) expect(entry.value).toEqual(records.find((record) => record.callId === entry.callId)!.value);
    listsNothing(window);
  });

  it("takes the newest entry of each tool id first, Core's notes included, then the rest newest first", () => {
    const feedback = (callId: string, size: number): AutomationStudioLlmEvidenceEntry =>
      ({ callId, toolId: "core.completion_check", value: { ok: false, code: "plan_invalid", detail: "y".repeat(size) } });
    const records = [page("call.1", 4_000), feedback("core.completion_check.2", 3_000), page("call.3", 4_000), feedback("core.completion_check.4", 10), page("call.5", 500, "other")];
    const window = automationStudioLlmEvidenceContextWindow(records, 7_000);

    expect(window.map((entry) => entry.callId)).toEqual(["call.3", "core.completion_check.4", "call.5"]);
    listsNothing(window);
  });

  it("never displaces the newest result", () => {
    const records = [page("call.1", 200), page("call.2", 1_700)];
    const newest = bytes([{ callId: "call.2", toolId: "inspect", value: records[1]!.value }]);
    const window = automationStudioLlmEvidenceContextWindow(records, newest + 10);

    expect(window).toEqual([{ callId: "call.2", toolId: "inspect", value: records[1]!.value }]);
  });

  it("skips a result too large for any window and keeps what does fit", () => {
    const window = automationStudioLlmEvidenceContextWindow([page("call.1", 500), page("call.2", 5_000, "act")], 2_048);

    expect(window.map((entry) => entry.callId)).toEqual(["call.1"]);
  });

  it("holds to the provider's entry count", () => {
    const records = Array.from({ length: 90 }, (_, index) => page(`call.${index + 1}`, 10));
    const window = automationStudioLlmEvidenceContextWindow(records, 64_000);

    expect(window).toHaveLength(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls);
    expect(window.at(-1)!.callId).toBe("call.90");
    listsNothing(window);
  });

  it("stays within its bytes and never cuts an entry, whatever the mix", () => {
    let seed = 7;
    const random = (limit: number) => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) % limit;
    for (let round = 0; round < 200; round += 1) {
      const records = Array.from({ length: 1 + random(80) }, (_, index): AutomationStudioLlmEvidenceEntry =>
        random(5) === 0 ? note(`core.request_check.${index}`) : page(`call.${index}`, random(6_000), `tool.${random(4)}`));
      const maxBytes = 1_024 + random(30_000);
      const window = automationStudioLlmEvidenceContextWindow(records, maxBytes);
      const byCallId = new Map(records.map((record) => [record.callId, record]));

      expect(bytes(window)).toBeLessThanOrEqual(maxBytes);
      expect(window.length).toBeLessThanOrEqual(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls);
      for (const entry of window) expect(entry.value).toEqual(byCallId.get(entry.callId)!.value);
      const newest = records.at(-1)!;
      if (bytes([{ callId: newest.callId, toolId: newest.toolId, value: newest.value }]) <= maxBytes) expect(window.at(-1)!.callId).toBe(newest.callId);
    }
  });
});
