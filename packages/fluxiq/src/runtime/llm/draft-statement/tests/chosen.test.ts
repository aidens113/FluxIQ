// The host's statement of the options that stood chosen as a press found it
// (t1023): read strictly, screened as a control's words are, carried onto
// the step the loop appends, where the acts checklist reads
// it (`../../../flow-authoring/bootstrap/instructed-acts/standing-option.ts`).
import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult, automationStudioLlmEvidenceToolResultInvalidCode } from "../../evidence-loop-decision.ts";

// The option is shown in the call's own evidence: on the page, or in what the call says stood chosen out of view.
const PAGE: JsonValue = { ok: true, page: "t6 button \"+ Add\"\nt9 clickable \"Large\" marked", outcome: { stoodChosen: ["t40 \"Collection\""] } };
const pressing = (chosen: unknown, effect: "observe" | "mutate" = "mutate"): JsonValue => ({
  kind: "llm_evidence_tool_execution",
  evidence: PAGE,
  effectApplied: true,
  draft: { actionId: "web.output.dom-click", input: { target: { handle: "t6" } }, effect, proposes: true, ...(chosen === undefined ? {} : { chosen }) }
}) as JsonValue;
const STOOD = [{ key: "t9", words: "Large" }, { key: "t40", words: "Collection" }];

describe("a call's statement of the options that stood chosen as it found the page", () => {
  it("is carried on the parse path when each option's words were shown in the call's evidence", () => {
    expect(automationStudioLlmEvidenceParseToolExecutionResult(pressing(STOOD), "mutate")?.draft?.chosen).toEqual(STOOD);
  });

  it("withholds a bad entry, never refusing the result, and keeps the rest", () => {
    const bad: unknown[] = [
      { key: "t41", words: "Delivery" }, // never shown in this call's evidence
      { key: "t9 t10", words: "Large" }, // a key that is no code
      { key: "t9", words: "Large", at: 1 }, // a key too many
      { key: "t9" }, // a key too few
      "Large", null, { key: "t9", words: "<b>Large</b>" }
    ];
    const value = pressing([...bad, ...STOOD]);
    const parsed = automationStudioLlmEvidenceParseToolExecutionResult(value, "mutate");
    expect(parsed?.effectApplied).toBe(true);
    expect(parsed?.draft?.chosen).toEqual(STOOD);
    expect(automationStudioLlmEvidenceToolResultInvalidCode(value, "mutate")).toBeUndefined();
  });

  it("is absent when nothing is left, when it is no list, past sixteen entries, and on a statement that changed nothing", () => {
    const cases: Array<[unknown, "observe" | "mutate"]> = [
      [[{ key: "t41", words: "Delivery" }], "mutate"], [[], "mutate"], [STOOD[0], "mutate"], [Array.from({ length: 17 }, () => STOOD[0]), "mutate"], [STOOD, "observe"]
    ];
    for (const [chosen, effect] of cases) {
      const value = pressing(chosen, effect);
      const parsed = automationStudioLlmEvidenceParseToolExecutionResult(value, "mutate");
      expect(parsed?.effectApplied, JSON.stringify(chosen)).toBe(true);
      expect(parsed?.draft, JSON.stringify(chosen)).not.toHaveProperty("chosen");
      expect(automationStudioLlmEvidenceToolResultInvalidCode(value, "mutate"), JSON.stringify(chosen)).toBeUndefined();
    }
    expect(automationStudioLlmEvidenceParseToolExecutionResult(pressing(Array.from({ length: 16 }, () => STOOD[0])), "mutate")?.draft?.chosen).toHaveLength(16);
  });

  it("is copied onto the step the loop appends, through the call's record", async () => {
    const go = { toolId: "go", description: "Go or press.", inputSchema: { type: "object" }, effect: "mutate" as const };
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "go", input: { target: "#t6" }, add: true })
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "ready" } });
    const executeTool = vi.fn().mockResolvedValueOnce(pressing(STOOD));
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool, maxIterations: 4, maxToolCalls: 2, dryRun: false, unusableDecisions: { stalled: () => new Error("stalled") } });
    expect(result.steps[0]).toMatchObject({ disposition: "kept", chosen: STOOD });
  });
});
