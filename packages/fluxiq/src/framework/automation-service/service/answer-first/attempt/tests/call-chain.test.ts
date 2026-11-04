// The chain under an attempt's permission gate: a reset never reaches the domain, a repeat of an
// act that landed never reaches it either, rows come from the answer alone, and the first lasting
// act reads its witness before it is sent.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstCallChain } from "../call-chain.ts";

function chain() {
  const events: string[] = [];
  const stored: JsonObject[] = [];
  const counts = { stepped: 0, answered: 0 };
  const execute = automationStudioAnswerFirstCallChain({
    domain: async (call): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
      events.push(`domain:${call.toolId}`);
      if (call.toolId === "refuse") return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "no" }, effectApplied: false };
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true, read: { extracted: [{ name: "Ada" }] } }, effectApplied: true, draft: { effect: "mutate" } };
    },
    record: new AutomationStudioAttemptActRecord(),
    sink: {
      fromCall: async (call, answer) => {
        stored.push({ toolId: call.toolId, kind: answer.kind });
        return undefined;
      }
    },
    witnesses: {
      beforeFirstLastingAct: async () => {
        events.push("witness");
        return { kind: "unread", note: { side: "before", code: "answer_first.witness_unread" } };
      }
    },
    readRowsKey: "read.extracted",
    describe: undefined,
    stepped: () => { counts.stepped += 1; },
    answered: () => { counts.answered += 1; }
  });
  return { execute, events, stored, counts };
}

const PRESS = { callId: "press", toolId: "press", value: { target: { handle: "t1" }, consequences: ["delete"] } };

describe("the attempt's call chain", () => {
  it("refuses a reset before anything is sent", async () => {
    const { execute, events, counts } = chain();
    const answer = await execute({ callId: "reset", toolId: "core.run_node", value: { node: "n", replay: "reset", from: {} } });
    expect(answer).toMatchObject({ resultCode: "answer_first.no_reset", effectApplied: false });
    expect(events).toEqual([]);
    expect(counts.stepped).toBe(0);
  });

  it("reads the witness before the first lasting act, tells the sink the answer, and refuses the same act again", async () => {
    const { execute, events, stored, counts } = chain();
    await execute(PRESS);
    expect(events).toEqual(["witness", "domain:press"]);
    expect(stored).toEqual([{ toolId: "press", kind: "llm_evidence_tool_execution" }]);
    expect(counts).toEqual({ stepped: 1, answered: 1 });
    const again = await execute({ ...PRESS, callId: "press.again" });
    expect(again).toMatchObject({ resultCode: "attempt.act_already_done" });
    expect(events.filter((event) => event === "domain:press")).toHaveLength(1);
  });

  it("does not take a refused answer for having arrived", async () => {
    const { execute, counts } = chain();
    await execute({ callId: "no", toolId: "refuse", value: { reason: "first words" } });
    await execute({ callId: "no.2", toolId: "refuse", value: { reason: "other words" } });
    expect(counts).toEqual({ stepped: 2, answered: 0 });
  });
});
