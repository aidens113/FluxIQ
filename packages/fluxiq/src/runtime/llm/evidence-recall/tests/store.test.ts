// The attempt's recall store (t1036, D10): an earlier round's call is recalled by its id, and an id that ran in more
// than one round stays distinct -- the current round's first, else the latest earlier one, and `round` picks.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, automationStudioLlmEvidenceRecallBinding, automationStudioLlmEvidenceRecallStore } from "../index.ts";

const inspect = { toolId: "web.inspect", description: "Read the list.", inputSchema: { type: "object" }, effect: "observe" as const };
type Call = { callId: string; toolId: string; value: JsonObject };
const read = (name: string): JsonObject => ({ ok: true, read: { extracted: [{ name }] } });

function loop(answers: JsonObject[]) {
  const executeTool = vi.fn(async (_input: Call): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult> =>
    ({ kind: "llm_evidence_tool_execution", evidence: answers.shift() ?? {}, effectApplied: false }));
  return { tools: [inspect], observedStateKeys: ["read.extracted"], executeTool };
}

describe("the recall store", () => {
  it("keeps one id's results apart by round and gives the current round's, else the latest earlier, else the named one", () => {
    const store = automationStudioLlmEvidenceRecallStore();
    store.remember("c1", "first");
    store.round(2);
    store.remember("c1", "second");
    store.round(3);
    expect(store.recall("c1")).toEqual({ value: "second", round: 2, rounds: [1, 2], current: 3 });
    store.remember("c1", "third");
    expect(store.recall("c1")?.value).toBe("third");
    expect(store.recall("c1", 1)?.value).toBe("first");
    expect(store.recall("c1", 9)).toBeUndefined();
    expect(store.recall("nope")).toBeUndefined();
  });

  it("lets a later round's binding recall an earlier round's call, naming the round only where it is not the current one or the id repeats", async () => {
    const store = automationStudioLlmEvidenceRecallStore();
    const first = automationStudioLlmEvidenceRecallBinding(loop([read("a")]), store);
    await first.executeTool({ callId: "c1", toolId: "web.inspect", value: {} });
    const same = await first.executeTool({ callId: "r1", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: { callId: "c1" } }) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(same.evidence).toEqual({ recalled: "c1", restored: { read: { extracted: [{ name: "a" }] } } });

    store.round(2);
    const second = automationStudioLlmEvidenceRecallBinding(loop([read("b")]), store);
    const earlier = await second.executeTool({ callId: "r2", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: { callId: "c1" } }) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(earlier.resultCode).toBe("core.recall.restored");
    expect(earlier.evidence).toEqual({ recalled: "c1", round: 1, restored: { read: { extracted: [{ name: "a" }] } } });

    await second.executeTool({ callId: "c1", toolId: "web.inspect", value: {} });
    const repeated = await second.executeTool({ callId: "r3", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: { callId: "c1" } }) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(repeated.evidence).toEqual({ recalled: "c1", round: 2, roundsWithThisId: [1, 2], restored: { read: { extracted: [{ name: "b" }] } } });
    const picked = await second.executeTool({ callId: "r4", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: { callId: "c1", round: 1 } }) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(picked.evidence).toMatchObject({ round: 1, restored: { read: { extracted: [{ name: "a" }] } } });
    const missing = await second.executeTool({ callId: "r5", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: { callId: "c1", round: 7 } }) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(missing).toMatchObject({ resultCode: "core.recall.not_found", evidence: { recalled: "c1", round: 7, found: false } });
  });
});
