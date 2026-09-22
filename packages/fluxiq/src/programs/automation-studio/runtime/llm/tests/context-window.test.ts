import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../loop-limits/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, automationStudioLlmEvidenceContextWindow, type AutomationStudioLlmEvidenceRecord } from "../context-window.ts";

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
const page = (callId: string, size: number, changed: "yes" | "no" | "unknown" = "no", toolId = "inspect"): AutomationStudioLlmEvidenceRecord =>
  ({ callId, toolId, value: { page: callId, text: "x".repeat(size) }, call: { resultCode: "ok", changed } });
const note = (callId: string): AutomationStudioLlmEvidenceRecord =>
  ({ callId, toolId: "core.request_check", value: { ok: false, code: "llm_evidence_loop.already_answered" } });

type Listed = { callId: string; toolId: string; resultCode: string; changed: string };
const historyOf = (window: ReturnType<typeof automationStudioLlmEvidenceContextWindow>) =>
  window.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID)?.value as { code: string; calls: Listed[]; unlisted?: number; instruction: string } | undefined;

describe("the evidence one decision is shown", () => {
  it("is everything, unchanged and without the loop's bookkeeping, while everything fits", () => {
    const records = [page("call.1", 100), note("core.request_check.2"), page("call.3", 100, "yes", "act")];
    const window = automationStudioLlmEvidenceContextWindow(records, 24_000);

    expect(window).toEqual(records.map(({ callId, toolId, value }) => ({ callId, toolId, value })));
    expect(window.every((entry) => Object.keys(entry).join() === "callId,toolId,value")).toBe(true);
  });

  // The measured failure: a realistic build's total reached the old 64,000-byte
  // limit in fourteen calls. The window keeps the newest pages whole and lists
  // the rest, so the total can grow without the request growing with it.
  it("keeps the newest results whole and lists each call it no longer carries", () => {
    const records = [page("call.1", 9_000), page("call.2", 9_000, "yes", "act"), page("call.3", 9_000), page("call.4", 9_000, "yes", "act"), page("call.5", 9_000)];
    const window = automationStudioLlmEvidenceContextWindow(records, 24_000);

    expect(bytes(window)).toBeLessThanOrEqual(24_000);
    expect(window.map((entry) => entry.callId)).toEqual([AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, "call.4", "call.5"]);
    expect(window.slice(1).map((entry) => entry.value)).toEqual([records[3]!.value, records[4]!.value]);
    expect(historyOf(window)).toEqual({
      code: "llm_evidence_loop.earlier_calls",
      calls: [
        { callId: "call.1", toolId: "inspect", resultCode: "ok", changed: "no" },
        { callId: "call.2", toolId: "act", resultCode: "ok", changed: "yes" },
        { callId: "call.3", toolId: "inspect", resultCode: "ok", changed: "no" }
      ],
      instruction: expect.stringContaining("no longer shown")
    });
  });

  it("lists the most recent calls it has room for and counts the older ones, never quoting a result", () => {
    const records = [...Array.from({ length: 40 }, (_, index) => page(`call.${index + 1}`, 40)), page("call.41", 1_500)];
    const window = automationStudioLlmEvidenceContextWindow(records, 2_048);
    const history = historyOf(window)!;

    expect(bytes(window)).toBeLessThanOrEqual(2_048);
    expect(window.at(-1)).toEqual({ callId: "call.41", toolId: "inspect", value: records[40]!.value });
    expect(history.unlisted).toBeGreaterThan(0);
    const listed = history.calls.map((call) => call.callId);
    const shown = window.filter((entry) => entry.toolId !== AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID).map((entry) => entry.callId);
    // Every call is shown whole, listed, or counted -- exactly once -- and the listed ones are the most recent left out.
    expect(history.unlisted! + listed.length + shown.length).toBe(41);
    const left = records.map((record) => record.callId).filter((callId) => !shown.includes(callId));
    expect(listed).toEqual(left.slice(left.length - listed.length));
    expect(JSON.stringify(history)).not.toContain("xxxx");
  });

  it("gives Core's own notes no line when they leave", () => {
    // An old completion refusal, since superseded by a newer one, is too large to stay.
    const feedback = (callId: string, size: number): AutomationStudioLlmEvidenceRecord =>
      ({ callId, toolId: "core.completion_check", value: { ok: false, code: "plan_invalid", detail: "y".repeat(size) } });
    const records = [page("call.1", 4_000), feedback("core.completion_check.2", 3_000), page("call.3", 4_000), feedback("core.completion_check.4", 10), page("call.5", 500, "no", "other")];
    const window = automationStudioLlmEvidenceContextWindow(records, 7_000);

    expect(window.map((entry) => entry.callId)).toEqual([AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, "call.3", "core.completion_check.4", "call.5"]);
    expect(historyOf(window)?.calls.map((call) => call.callId)).toEqual(["call.1"]);
    expect(historyOf(window)?.unlisted).toBeUndefined();
  });

  it("never lets the history displace the newest result", () => {
    const records = [page("call.1", 200), page("call.2", 1_700)];
    const newest = bytes([{ callId: "call.2", toolId: "inspect", value: records[1]!.value }]);
    const window = automationStudioLlmEvidenceContextWindow(records, newest + 10);

    expect(window).toEqual([{ callId: "call.2", toolId: "inspect", value: records[1]!.value }]);
  });

  it("lists a result too large for any window instead of dropping it silently", () => {
    const window = automationStudioLlmEvidenceContextWindow([page("call.1", 500), page("call.2", 5_000, "unknown", "act")], 2_048);

    expect(window.map((entry) => entry.callId)).toEqual([AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, "call.1"]);
    expect(historyOf(window)?.calls).toEqual([{ callId: "call.2", toolId: "act", resultCode: "ok", changed: "unknown" }]);
  });

  it("holds to the provider's entry count, the history included", () => {
    const records = Array.from({ length: 90 }, (_, index) => page(`call.${index + 1}`, 10));
    const window = automationStudioLlmEvidenceContextWindow(records, 64_000);

    expect(window).toHaveLength(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls);
    expect(window[0]!.toolId).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID);
    expect(window.at(-1)!.callId).toBe("call.90");
  });

  it("stays within its bytes and never cuts an entry, whatever the mix", () => {
    let seed = 7;
    const random = (limit: number) => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) % limit;
    for (let round = 0; round < 200; round += 1) {
      const records = Array.from({ length: 1 + random(80) }, (_, index): AutomationStudioLlmEvidenceRecord =>
        random(5) === 0 ? note(`core.request_check.${index}`) : page(`call.${index}`, random(6_000), "no", `tool.${random(4)}`));
      const maxBytes = 1_024 + random(30_000);
      const window = automationStudioLlmEvidenceContextWindow(records, maxBytes);
      const byCallId = new Map(records.map((record) => [record.callId, record]));

      expect(bytes(window)).toBeLessThanOrEqual(maxBytes);
      expect(window.length).toBeLessThanOrEqual(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls);
      for (const entry of window) {
        if (entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID) continue;
        expect(entry.value).toEqual(byCallId.get(entry.callId)!.value);
      }
      const newest = records.at(-1)!;
      if (bytes([{ callId: newest.callId, toolId: newest.toolId, value: newest.value }]) <= maxBytes) expect(window.at(-1)!.callId).toBe(newest.callId);
    }
  });
});
